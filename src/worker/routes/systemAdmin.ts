import {
  canAccessAdminPanel,
  canRemoveNamespaceEntry,
  canToggleNamespaceStatus,
  formatPatScopeLabel,
  normalizeNamespaceHandle,
  sanitizeDisplayName,
  validateUserPassword,
  type AdminNamespaceEntry,
  type AdminRepositoryEntry,
  type AdminTokenEntry,
  type DirectoryRole,
  type DirectoryStatus,
} from "@/shared/admin/panel";
import { shortRefName } from "@/shared/git/ref-display";
import { safeParseJsonRequest } from "@/shared/web";
import type { Viewer } from "@/client/server/viewer";
import { buildLocalAccountSubject, resolveAdminAuthConfig } from "@/worker/auth/adminAuth";
import { sameOriginViolation } from "@/worker/auth/origin";
import { hashPassword } from "@/worker/auth/passwords";
import { viewerIsNamespaceMember } from "@/worker/auth/pat";
import { loadViewer } from "@/worker/auth/session";
import { getRepoStub, json, newPrefixedId } from "@/worker/common";
import {
  claimNamespace,
  deleteNamespaceEntry,
  deleteRepositoryById,
  findNamespaceById,
  findNamespaceBySlug,
  findNamespaceDirectoryMeta,
  findRepositoryById,
  findUserBySubject,
  insertMembershipIfMissing,
  insertUserIfNew,
  listAllNamespaceDirectoryEntries,
  listAllRepositoriesWithNamespaces,
  listPatsForUser,
  updateNamespaceHandle,
  upsertNamespaceDirectoryMeta,
} from "@/worker/db/d1/dal";
import { getLimiter, type Limiter } from "@/worker/git/operations/limits";
import { enqueueRouteCacheSync, safeRedirect, summarizeTokens } from "./authShared";
import type { AppContext, AppRouter } from "./hono";
import {
  AdminNamespaceCreateRequestSchema,
  AdminNamespacePatchRequestSchema,
  AdminRepositoryDeleteRequestSchema,
} from "./requestSchemas";
import { renderUiDocumentResponse } from "./uiResponse";

async function resolvePrimaryAdminNamespaceId(c: AppContext): Promise<string | null> {
  const adminUsername = resolveAdminAuthConfig(c.env).username;
  const ns = await findNamespaceBySlug(c.var.db, adminUsername);
  return ns?.id ?? null;
}

async function requireAdminApiViewer(
  c: AppContext
): Promise<{ ok: true; viewer: Viewer } | { ok: false; response: Response }> {
  const viewer = await loadViewer(c);
  if (!viewer) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401) };
  }
  if (!canAccessAdminPanel(viewer.role)) {
    return { ok: false, response: json({ ok: false, reason: "admin-required" } as const, 403) };
  }
  return { ok: true, viewer };
}

async function resolveDefaultBranch(
  env: Env,
  limiter: Limiter,
  doName: string
): Promise<string> {
  try {
    const stub = getRepoStub(env, doName);
    const head = await limiter.run("do:system-admin-head", async () => await stub.getHead());
    if (head && typeof head.target === "string" && head.target.length > 0) {
      return shortRefName(head.target);
    }
  } catch {
    // Empty or uninitialized DO falls back cleanly to the default branch name.
  }
  return "main";
}

function summarizeAdminTokens(
  tokens: Awaited<ReturnType<typeof summarizeTokens>>
): AdminTokenEntry[] {
  return tokens.map((token) => {
    const firstNs = token.namespaceGrants[0];
    const firstRepo = token.repoGrants[0];
    const level = firstNs?.level ?? firstRepo?.level ?? "pull";
    const targetLabel = firstNs
      ? `@${firstNs.namespaceSlug}`
      : firstRepo
        ? `${firstRepo.namespaceSlug}/${firstRepo.repoSlug}`
        : "unscoped";
    return {
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      createdAt: token.createdAt,
      revokedAt: token.revokedAt ?? undefined,
      lastUsedAt: token.lastUsedAt ?? undefined,
      scopeLabel: formatPatScopeLabel(level),
      targetLabel,
    };
  });
}

async function loadDirectoryUsers(c: AppContext): Promise<AdminNamespaceEntry[]> {
  const primaryNamespaceId = await resolvePrimaryAdminNamespaceId(c);
  const directoryRows = await listAllNamespaceDirectoryEntries(
    c.env.DB,
    c.var.db,
    primaryNamespaceId
  );
  return directoryRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    repoCount: row.repoCount,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
    isPrimaryAdmin: primaryNamespaceId !== null && row.id === primaryNamespaceId,
    hasPassword: row.hasPassword,
  }));
}

async function loadSystemAdminData(
  c: AppContext,
  viewer: Viewer
): Promise<{
  origin: string;
  primaryNamespaceSlug?: string;
  namespaces: AdminNamespaceEntry[];
  repositories: AdminRepositoryEntry[];
  tokens: AdminTokenEntry[];
}> {
  const db = c.var.db;
  const [namespaces, repoRows, patRows] = await Promise.all([
    loadDirectoryUsers(c),
    listAllRepositoriesWithNamespaces(db),
    listPatsForUser(db, viewer.userId),
  ]);

  const tokenSummaries = await summarizeTokens(db, patRows);
  const limiter = getLimiter();

  // Resolve default branch for up to 24 repositories within the request budget;
  // additional repositories fall back to "main" to avoid fanning out subrequests.
  const repositories: AdminRepositoryEntry[] = await Promise.all(
    repoRows.map(async (row, index) => {
      const defaultBranch =
        index < 24 ? await resolveDefaultBranch(c.env, limiter, row.doName) : "main";
      return {
        id: row.id,
        slug: row.slug,
        namespaceId: row.namespaceId,
        namespaceSlug: row.namespaceSlug,
        visibility: row.visibility,
        defaultBranch,
        updatedAt: row.updatedAt,
      };
    })
  );

  const url = new URL(c.req.url);
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host")?.trim();
  const origin =
    forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : url.origin;

  return {
    origin,
    primaryNamespaceSlug: viewer.primaryNamespaceSlug,
    namespaces,
    repositories,
    tokens: summarizeAdminTokens(tokenSummaries),
  };
}

async function handleCreateDirectoryUser(c: AppContext): Promise<Response> {
  const log = c.var.logFor({ service: "SystemAdmin" });
  const violation = sameOriginViolation(c);
  if (violation) {
    log.warn("system-admin:namespace-create-same-origin-violation");
    return violation;
  }
  const auth = await requireAdminApiViewer(c);
  if (!auth.ok) return auth.response;
  const viewer = auth.viewer;

  const rawBody = await safeParseJsonRequest(c.req.raw);
  const parsed = AdminNamespaceCreateRequestSchema.safeParse(rawBody);
  const body = parsed.success
    ? parsed.data
    : {
        handle: "",
        displayName: "",
        role: "member" as DirectoryRole,
        status: "active" as DirectoryStatus,
        password: undefined,
      };

  const slugResult = normalizeNamespaceHandle(body.handle);
  if (!slugResult.ok) {
    log.warn("system-admin:namespace-invalid-handle", { reason: slugResult.reason });
    return json(
      {
        ok: false,
        reason: slugResult.reason === "reserved" ? "reserved-handle" : "invalid-handle",
      } as const,
      400
    );
  }

  let passwordHash: string | null = null;
  if (body.password !== undefined) {
    const pwValidation = validateUserPassword(body.password);
    if (!pwValidation.ok) {
      log.warn("system-admin:namespace-invalid-password", { reason: pwValidation.reason });
      return json(
        {
          ok: false,
          reason:
            pwValidation.reason === "too-short" ? "password-too-short" : "password-too-long",
        } as const,
        400
      );
    }
    passwordHash = await hashPassword(pwValidation.password);
  }

  const handle = slugResult.slug;
  const displayName = sanitizeDisplayName(body.displayName, handle);
  const db = c.var.db;
  const existingNamespace = await findNamespaceBySlug(db, handle);
  if (existingNamespace) {
    log.warn("system-admin:namespace-already-exists", { handle });
    return json({ ok: false, reason: "handle-taken" } as const, 409);
  }

  const now = Date.now();
  const subject = buildLocalAccountSubject(handle);
  const existingUser = await findUserBySubject(db, subject);
  const targetUser =
    existingUser ??
    (await insertUserIfNew(db, {
      id: newPrefixedId("user"),
      tesseraSub: subject,
      createdAt: now,
    })) ??
    (await findUserBySubject(db, subject));

  if (!targetUser) {
    log.error("system-admin:user-provision-failed", { handle });
    return json({ ok: false, reason: "provision-failed" } as const, 500);
  }

  const claimed = await claimNamespace(db, {
    id: newPrefixedId("ns"),
    slug: handle,
    createdBy: targetUser.id,
    createdAt: now,
  });
  if (!claimed) {
    return json({ ok: false, reason: "handle-taken" } as const, 409);
  }

  // Grant membership to both the new account and the current admin so the
  // admin can manage repositories and tokens under this namespace smoothly.
  await insertMembershipIfMissing(db, {
    namespaceId: claimed.id,
    userId: targetUser.id,
    createdAt: now,
  });
  if (viewer.userId !== targetUser.id) {
    await insertMembershipIfMissing(db, {
      namespaceId: claimed.id,
      userId: viewer.userId,
      createdAt: now,
    });
  }

  await upsertNamespaceDirectoryMeta(c.env.DB, claimed.id, {
    displayName,
    role: body.role,
    status: body.status,
    passwordHash,
    lastActiveAt: now,
    now,
  });

  log.info("system-admin:namespace-created", {
    actor: viewer.userId,
    namespaceId: claimed.id,
    slug: claimed.slug,
    displayName,
    role: body.role,
    status: body.status,
    hasPassword: Boolean(passwordHash),
  });

  const entry: AdminNamespaceEntry = {
    id: claimed.id,
    slug: claimed.slug,
    displayName,
    role: body.role,
    status: body.status,
    repoCount: 0,
    createdAt: now,
    lastActiveAt: now,
    isPrimaryAdmin: false,
    hasPassword: Boolean(passwordHash),
  };

  return json({ ok: true, user: entry, namespace: entry } as const, 201);
}

async function handlePatchDirectoryUser(c: AppContext, namespaceId: string): Promise<Response> {
  const log = c.var.logFor({ service: "SystemAdmin" });
  const violation = sameOriginViolation(c);
  if (violation) {
    log.warn("system-admin:namespace-patch-same-origin-violation");
    return violation;
  }
  const auth = await requireAdminApiViewer(c);
  if (!auth.ok) return auth.response;
  const viewer = auth.viewer;

  const db = c.var.db;
  const ns = await findNamespaceById(db, namespaceId);
  if (!ns) {
    return json({ ok: false, reason: "not-found" } as const, 404);
  }

  const primaryNamespaceId = await resolvePrimaryAdminNamespaceId(c);
  const isPrimaryAdmin = primaryNamespaceId !== null && ns.id === primaryNamespaceId;

  const rawBody = await safeParseJsonRequest(c.req.raw);
  const parsed = AdminNamespacePatchRequestSchema.safeParse(rawBody);
  if (
    !parsed.success ||
    (parsed.data.handle === undefined &&
      parsed.data.displayName === undefined &&
      parsed.data.role === undefined &&
      parsed.data.status === undefined &&
      parsed.data.password === undefined)
  ) {
    return json({ ok: false, reason: "invalid-payload" } as const, 400);
  }

  // Primary signed-in admin can edit displayName, but cannot be disabled,
  // demoted from admin, have its handle renamed, or override its env password.
  if (!canToggleNamespaceStatus({ id: ns.id, isPrimaryAdmin })) {
    const wantsDisable = parsed.data.status !== undefined && parsed.data.status !== "active";
    const wantsDemote = parsed.data.role !== undefined && parsed.data.role !== "admin";
    const wantsRename =
      parsed.data.handle !== undefined &&
      parsed.data.handle.replace(/^@+/, "").toLowerCase() !== ns.slug;
    const wantsPassword = parsed.data.password !== undefined;
    if (wantsDisable || wantsDemote || wantsRename || wantsPassword) {
      log.warn("system-admin:namespace-protected", { namespaceId });
      return json({ ok: false, reason: "protected-admin" } as const, 400);
    }
  }

  let nextPasswordHash: string | undefined;
  if (parsed.data.password !== undefined) {
    const pwValidation = validateUserPassword(parsed.data.password);
    if (!pwValidation.ok) {
      return json(
        {
          ok: false,
          reason:
            pwValidation.reason === "too-short" ? "password-too-short" : "password-too-long",
        } as const,
        400
      );
    }
    nextPasswordHash = await hashPassword(pwValidation.password);
  }

  let nextSlug = ns.slug;
  if (parsed.data.handle !== undefined) {
    const slugResult = normalizeNamespaceHandle(parsed.data.handle);
    if (!slugResult.ok) {
      log.warn("system-admin:namespace-invalid-handle", { reason: slugResult.reason });
      return json(
        {
          ok: false,
          reason: slugResult.reason === "reserved" ? "reserved-handle" : "invalid-handle",
        } as const,
        400
      );
    }
    if (slugResult.slug !== ns.slug) {
      const conflict = await findNamespaceBySlug(db, slugResult.slug);
      if (conflict && conflict.id !== ns.id) {
        log.warn("system-admin:namespace-rename-conflict", {
          namespaceId: ns.id,
          requestedSlug: slugResult.slug,
        });
        return json({ ok: false, reason: "handle-taken" } as const, 409);
      }
      const renamed = await updateNamespaceHandle(
        db,
        ns.id,
        slugResult.slug,
        ns.createdBy,
        viewer.userId,
        buildLocalAccountSubject(slugResult.slug)
      );
      if (!renamed) {
        return json({ ok: false, reason: "not-found" } as const, 404);
      }
      nextSlug = slugResult.slug;
    }
  }

  const existingMeta = await findNamespaceDirectoryMeta(c.env.DB, ns.id);
  const nextRole: DirectoryRole = isPrimaryAdmin
    ? "admin"
    : (parsed.data.role ?? existingMeta?.role ?? "member");
  const nextStatus: DirectoryStatus = isPrimaryAdmin
    ? "active"
    : (parsed.data.status ?? existingMeta?.status ?? "active");
  const nextDisplayName = sanitizeDisplayName(
    parsed.data.displayName !== undefined
      ? parsed.data.displayName
      : (existingMeta?.display_name ?? ""),
    nextSlug
  );
  const now = Date.now();
  const lastActiveAt = existingMeta?.last_active_at ?? now;
  const hasPassword = Boolean(nextPasswordHash ?? existingMeta?.password_hash);

  await upsertNamespaceDirectoryMeta(c.env.DB, ns.id, {
    displayName: nextDisplayName,
    role: nextRole,
    status: nextStatus,
    ...(nextPasswordHash !== undefined ? { passwordHash: nextPasswordHash } : {}),
    lastActiveAt,
    now,
  });

  log.info("system-admin:namespace-updated", {
    actor: viewer.userId,
    namespaceId: ns.id,
    slug: nextSlug,
    displayName: nextDisplayName,
    role: nextRole,
    status: nextStatus,
    passwordUpdated: nextPasswordHash !== undefined,
  });

  return json({
    ok: true,
    id: ns.id,
    slug: nextSlug,
    displayName: nextDisplayName,
    role: nextRole,
    status: nextStatus,
    lastActiveAt,
    hasPassword,
  } as const);
}

async function handleDeleteDirectoryUser(c: AppContext, namespaceId: string): Promise<Response> {
  const log = c.var.logFor({ service: "SystemAdmin" });
  const violation = sameOriginViolation(c);
  if (violation) {
    log.warn("system-admin:namespace-delete-same-origin-violation");
    return violation;
  }
  const auth = await requireAdminApiViewer(c);
  if (!auth.ok) return auth.response;
  const viewer = auth.viewer;

  const db = c.var.db;
  const ns = await findNamespaceById(db, namespaceId);
  if (!ns) {
    return json({ ok: false, reason: "not-found" } as const, 404);
  }

  const primaryNamespaceId = await resolvePrimaryAdminNamespaceId(c);
  const isPrimaryAdmin = primaryNamespaceId !== null && ns.id === primaryNamespaceId;
  const meta = await findNamespaceDirectoryMeta(c.env.DB, ns.id);
  const role: DirectoryRole = isPrimaryAdmin ? "admin" : (meta?.role ?? "member");

  if (!canRemoveNamespaceEntry({ id: ns.id, role, isPrimaryAdmin })) {
    log.warn("system-admin:namespace-remove-blocked", { namespaceId, role });
    return json({ ok: false, reason: "cannot-remove-admin" } as const, 403);
  }

  const removed = await deleteNamespaceEntry(c.env.DB, db, ns.id, ns.createdBy, viewer.userId);
  if (!removed) {
    return json({ ok: false, reason: "not-found" } as const, 404);
  }

  log.info("system-admin:namespace-removed", {
    actor: viewer.userId,
    namespaceId: ns.id,
    slug: ns.slug,
  });

  return json({ ok: true, id: ns.id } as const);
}

export function registerSystemAdminRoutes(router: AppRouter) {
  router.get(`/admin`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const data = await loadSystemAdminData(c, viewer);
    return renderUiDocumentResponse(c.env, "system-admin", data, {
      failureBody: "Failed to render admin panel\n",
      viewer,
    });
  });

  router.get(`/admin/users`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin%2Fusers");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const users = await loadDirectoryUsers(c);
    return renderUiDocumentResponse(
      c.env,
      "system-admin-users",
      {
        primaryNamespaceSlug: resolveAdminAuthConfig(c.env).username,
        users,
      },
      {
        failureBody: "Failed to render users management page\n",
        viewer,
      }
    );
  });

  router.get(`/admin/settings`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin%2Fsettings");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const [users, repoRows] = await Promise.all([
      loadDirectoryUsers(c),
      listAllRepositoriesWithNamespaces(c.var.db),
    ]);
    const authConfig = resolveAdminAuthConfig(c.env);
    const url = new URL(c.req.url);
    const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost =
      c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host")?.trim();
    const origin =
      forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : url.origin;

    return renderUiDocumentResponse(
      c.env,
      "system-admin-settings",
      {
        authMode: authConfig.mode,
        primaryAdminHandle: authConfig.username,
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.status === "active").length,
        totalRepositories: repoRows.length,
        publicRepositories: repoRows.filter((r) => r.visibility === "public").length,
        privateRepositories: repoRows.filter((r) => r.visibility === "private").length,
        origin,
      },
      {
        failureBody: "Failed to render admin settings control panel\n",
        viewer,
      }
    );
  });

  router.get(`/admin/SettingsControlPanel`, (c) => safeRedirect(c, "/admin/settings", 302));

  router.get(`/admin/api/overview`, async (c) => {
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;
    const data = await loadSystemAdminData(c, auth.viewer);
    return json(data);
  });

  router.get(`/admin/api/users`, async (c) => {
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;
    const users = await loadDirectoryUsers(c);
    return json({ users });
  });

  router.post(`/admin/api/users`, (c) => handleCreateDirectoryUser(c));
  router.patch(`/admin/api/users/:userId`, (c) =>
    handlePatchDirectoryUser(c, c.req.param("userId"))
  );
  router.delete(`/admin/api/users/:userId`, (c) =>
    handleDeleteDirectoryUser(c, c.req.param("userId"))
  );

  // Backward-compatible namespace directory API paths
  router.post(`/admin/api/namespaces`, (c) => handleCreateDirectoryUser(c));
  router.patch(`/admin/api/namespaces/:namespaceId`, (c) =>
    handlePatchDirectoryUser(c, c.req.param("namespaceId"))
  );
  router.delete(`/admin/api/namespaces/:namespaceId`, (c) =>
    handleDeleteDirectoryUser(c, c.req.param("namespaceId"))
  );

  router.delete(`/admin/api/repositories/:repositoryId`, async (c) => {
    const log = c.var.logFor({ service: "SystemAdmin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("system-admin:repo-delete-same-origin-violation");
      return violation;
    }
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;
    const viewer = auth.viewer;

    const repositoryId = c.req.param("repositoryId");
    const db = c.var.db;
    const repo = await findRepositoryById(db, repositoryId);
    if (!repo) {
      return json({ ok: false, reason: "not-found" } as const, 404);
    }

    const isMember = await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId);
    if (!isMember) {
      log.warn("system-admin:repo-delete-forbidden", {
        actor: viewer.userId,
        repositoryId,
      });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }

    const namespace = await findNamespaceById(db, repo.namespaceId);
    const expectedConfirm = namespace ? `${namespace.slug}/${repo.slug}` : repo.slug;
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = AdminRepositoryDeleteRequestSchema.safeParse(rawBody);
    const confirm = parsed.success ? parsed.data.confirm : "";

    if (confirm !== expectedConfirm) {
      return json(
        {
          ok: false,
          reason: "confirmation-required",
          expected: expectedConfirm,
        } as const,
        400
      );
    }

    const deleted = await deleteRepositoryById(db, repositoryId);
    if (!deleted) {
      return json({ ok: false, reason: "not-found" } as const, 404);
    }

    if (namespace) {
      enqueueRouteCacheSync(c, log, {
        repositoryId,
        namespaceSlug: namespace.slug,
        repoSlug: repo.slug,
      });
    }

    log.info("system-admin:repo-deleted", {
      actor: viewer.userId,
      repositoryId,
      namespaceSlug: namespace?.slug,
      slug: repo.slug,
    });

    return json({ ok: true, id: repositoryId } as const);
  });
}
