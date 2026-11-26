import { canAccessAdminPanel, canIssueGlobalPat, canWriteRepositories } from "@/shared/admin/panel";
import { safeParseJsonRequest } from "@/shared/web";
import { validateRepoSlugForRoute, validateSlugForRoute } from "@/shared/slugs";
import { json, newPrefixedId } from "@/worker/common";
import {
  findNamespaceBySlug,
  findRepositoryByNamespaceAndSlug,
  getNamespaceProfileMeta,
  insertPatGlobalGrant,
  insertPatWithGrants,
  listNamespacesForUser,
  listPatsForUser,
  listRepositoriesForUser,
  listRepositoryMetaMap,
  revokePatById,
} from "@/worker/db/d1/dal";
import { sameOriginViolation } from "@/worker/auth/origin";
import { loadViewer } from "@/worker/auth/session";
import {
  generatePatPlaintext,
  hashPatPlaintext,
  validatePatName,
  viewerIsNamespaceMember,
} from "@/worker/auth/pat";
import type { UserSettingsSection } from "@/client/components/UserSettingsLayout";
import type { AppContext, AppRouter } from "./hono";
import { renderUiDocumentResponse } from "./uiResponse";
import { safeRedirect, summarizeTokens } from "./authShared";
import { PatCreateRequestSchema } from "./requestSchemas";

async function renderUserSettingsView(
  c: AppContext,
  activeSection: UserSettingsSection,
  loginNextPath?: string
): Promise<Response> {
  const viewer = await loadViewer(c);
  if (!viewer) {
    const authUrl = loginNextPath ? `/auth?next=${encodeURIComponent(loginNextPath)}` : "/auth";
    return safeRedirect(c, authUrl);
  }
  const db = c.var.db;
  const [namespaces, repositoryRows, tokenRows] = await Promise.all([
    listNamespacesForUser(db, viewer.userId),
    listRepositoriesForUser(db, viewer.userId),
    listPatsForUser(db, viewer.userId),
  ]);
  const primaryNs =
    namespaces.find((ns) => ns.slug === viewer.primaryNamespaceSlug) ?? namespaces[0];
  const [tokens, profileMeta, repoMeta] = await Promise.all([
    summarizeTokens(db, tokenRows, c.env.DB),
    primaryNs
      ? getNamespaceProfileMeta(c.env.DB, primaryNs.id)
      : Promise.resolve({ bio: "", location: "", website: "" }),
    listRepositoryMetaMap(
      c.env.DB,
      repositoryRows.map((row) => row.repository.id)
    ),
  ]);
  return renderUiDocumentResponse(
    c.env,
    "account",
    {
      userId: viewer.userId,
      primaryNamespaceSlug: viewer.primaryNamespaceSlug,
      displayName: viewer.displayName,
      bio: profileMeta.bio,
      location: profileMeta.location,
      website: profileMeta.website,
      viewerRole: viewer.role,
      isPrimaryAdmin: viewer.isPrimaryAdmin,
      hasPassword: viewer.hasPassword,
      activeSection,
      namespaces: namespaces.map((ns) => ({ id: ns.id, slug: ns.slug })),
      repositories: repositoryRows.map((row) => ({
        id: row.repository.id,
        slug: row.repository.slug,
        namespaceSlug: row.namespace.slug,
        visibility: row.repository.visibility,
        description: repoMeta.get(row.repository.id)?.description ?? "",
        pinned: repoMeta.get(row.repository.id)?.pinned ?? false,
        homePinned: repoMeta.get(row.repository.id)?.homePinned ?? false,
        updatedAt: row.repository.updatedAt,
      })),
      tokens,
    },
    { failureBody: "Failed to render page\n", viewer }
  );
}

export function registerAuthTokenRoutes(router: AppRouter) {
  // Dedicated Gitea-style /user/* directory routes
  router.get(`/user`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) return safeRedirect(c, "/auth?next=%2Fuser%2Fprofile");
    return safeRedirect(c, "/user/profile");
  });

  router.get(`/user/profile`, (c) => renderUserSettingsView(c, "profile", "/user/profile"));
  router.get(`/user/account`, (c) => renderUserSettingsView(c, "account", "/user/account"));
  router.get(`/user/accounts`, (c) => renderUserSettingsView(c, "account", "/user/accounts"));
  router.get(`/user/settings`, (c) => renderUserSettingsView(c, "settings", "/user/settings"));
  router.get(`/user/settings/security`, (c) =>
    renderUserSettingsView(c, "security", "/user/settings/security")
  );
  router.get(`/user/settings/tokens`, (c) =>
    renderUserSettingsView(c, "tokens", "/user/settings/tokens")
  );

  // Backward-compatible combined account hub
  router.get(`/auth/account`, (c) => renderUserSettingsView(c, "all"));

  router.get(`/auth/api/tokens`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) return json({ error: "Unauthorized" }, 401);
    const db = c.var.db;
    const tokens = await listPatsForUser(db, viewer.userId);
    const summaries = await summarizeTokens(db, tokens, c.env.DB);
    return json({ tokens: summaries });
  });

  router.post(`/auth/api/tokens`, async (c) => {
    const log = c.var.logFor({ service: "AuthPat" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("pat:create-same-origin-violation");
      return violation;
    }
    const viewer = await loadViewer(c);
    if (!viewer) {
      log.info("pat:create-not-authenticated");
      return json({ error: "Unauthorized" }, 401);
    }

    // Required tagged-union body shape:
    //   { scope: "namespace", name, namespaceSlug, level }
    //   { scope: "repo", name, namespaceSlug, repoSlug, level }
    //   { scope: "global", name, level } (admin only)
    // `scope` and `level` are both required so contract drift surfaces as
    // a 400 instead of silently coercing. `level === "push"` includes pull
    // access by construction (see `pat_*_grants.level` CHECK).
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsedBody = PatCreateRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      log.warn("pat:create-invalid-scope");
      return json({ error: "Body must include scope: 'namespace', 'repo', or 'global'" }, 400);
    }
    const body = parsedBody.data;

    const nameValidation = validatePatName(body.name);
    if (!nameValidation.ok) {
      log.warn("pat:create-invalid-name", { reason: nameValidation.reason });
      return json({ error: "Invalid token name" }, 400);
    }
    const level = body.level;
    if (level === null) {
      log.warn("pat:create-invalid-level");
      return json({ error: "Body must include level: 'pull' or 'push'" }, 400);
    }
    if (level === "push" && !canWriteRepositories(viewer.role)) {
      log.warn("pat:create-viewer-push-blocked", { userId: viewer.userId, role: viewer.role });
      return json({ error: "Viewer accounts can only create read-only (pull) tokens" }, 403);
    }

    const db = c.var.db;
    if (body.scope === "global") {
      if (!canIssueGlobalPat(viewer.role)) {
        log.warn("pat:create-global-forbidden", { userId: viewer.userId, role: viewer.role });
        return json({ error: "Only active administrators can create all-namespace tokens" }, 403);
      }
      const generated = generatePatPlaintext();
      const hash = await hashPatPlaintext(generated.plaintext);
      const now = Date.now();
      const patId = newPrefixedId("pat");
      await insertPatWithGrants(db, {
        pat: {
          id: patId,
          userId: viewer.userId,
          name: nameValidation.name,
          prefix: generated.publicPrefix,
          hash,
          createdAt: now,
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: null,
        },
        namespaceGrants: [],
        repoGrants: [],
      });
      await insertPatGlobalGrant(c.env.DB, { patId, level, createdAt: now });
      log.info("pat:create-ok", {
        userId: viewer.userId,
        patId,
        prefix: generated.publicPrefix,
        scope: "global",
        level,
      });
      return json({ id: patId, plaintext: generated.plaintext, prefix: generated.publicPrefix });
    }

    const slugValidation = validateSlugForRoute(body.namespaceSlug);
    if (!slugValidation.ok) {
      log.warn("pat:create-invalid-namespace-slug", { reason: slugValidation.reason });
      return json({ error: "Invalid namespace slug" }, 400);
    }
    let repoSlug: string | null = null;
    if (body.scope === "repo") {
      const repoSlugValidation = validateRepoSlugForRoute(body.repoSlug);
      if (!repoSlugValidation.ok) {
        log.warn("pat:create-invalid-repo-slug", { reason: repoSlugValidation.reason });
        return json({ error: "Invalid repo slug" }, 400);
      }
      repoSlug = repoSlugValidation.slug;
    }
    const namespace = await findNamespaceBySlug(db, slugValidation.slug);
    if (!namespace) {
      log.warn("pat:create-namespace-not-found", { namespaceSlug: slugValidation.slug });
      return json({ error: "Namespace not found" }, 404);
    }
    const isMember = await viewerIsNamespaceMember(db, viewer.userId, namespace.id);
    if (!canAccessAdminPanel(viewer.role) && !isMember) {
      log.warn("pat:create-not-member", {
        userId: viewer.userId,
        namespaceId: namespace.id,
      });
      return json({ error: "Forbidden" }, 403);
    }

    let repoId: string | null = null;
    if (body.scope === "repo" && repoSlug !== null) {
      const repository = await findRepositoryByNamespaceAndSlug(db, namespace.id, repoSlug);
      if (!repository) {
        log.warn("pat:create-repo-not-found", {
          namespaceId: namespace.id,
          repoSlug,
        });
        return json({ error: "Repo not found" }, 404);
      }
      repoId = repository.id;
    }

    const generated = generatePatPlaintext();
    const hash = await hashPatPlaintext(generated.plaintext);
    const now = Date.now();
    const patId = newPrefixedId("pat");
    await insertPatWithGrants(db, {
      pat: {
        id: patId,
        userId: viewer.userId,
        name: nameValidation.name,
        prefix: generated.publicPrefix,
        hash,
        createdAt: now,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
      },
      namespaceGrants:
        body.scope === "namespace" ? [{ patId, namespaceId: namespace.id, level }] : [],
      repoGrants: body.scope === "repo" && repoId !== null ? [{ patId, repoId, level }] : [],
    });
    log.info("pat:create-ok", {
      userId: viewer.userId,
      patId,
      prefix: generated.publicPrefix,
      scope: body.scope,
      namespaceSlug: slugValidation.slug,
      repoSlug,
      level,
    });
    return json({ id: patId, plaintext: generated.plaintext, prefix: generated.publicPrefix });
  });

  router.delete(`/auth/api/tokens/:patId`, async (c) => {
    const log = c.var.logFor({ service: "AuthPat" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("pat:revoke-same-origin-violation");
      return violation;
    }
    const viewer = await loadViewer(c);
    if (!viewer) return json({ error: "Unauthorized" }, 401);
    const patId = c.req.param("patId");
    const result = await revokePatById(c.var.db, patId, viewer.userId, Date.now());
    if (result.ok) {
      log.info("pat:revoke-ok", { userId: viewer.userId, patId });
      return json({ ok: true });
    }
    if (result.reason === "not-owner") {
      log.warn("pat:revoke-not-owner", { userId: viewer.userId, patId });
      return json({ error: "Forbidden" }, 403);
    }
    if (result.reason === "not-found") {
      log.warn("pat:revoke-not-found", { userId: viewer.userId, patId });
      return json({ error: "Not found" }, 404);
    }
    // Re-revoke is idempotent; surface as a 200 but record it for visibility.
    log.debug("pat:revoke-already-revoked", { userId: viewer.userId, patId });
    return json({ ok: true });
  });
}
