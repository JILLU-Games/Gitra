import {
  buildDefaultProfileReadmeTemplate,
  buildDefaultRepoReadmeTemplate,
  canWriteRepositories,
  sanitizeRepoDescription,
} from "@/shared/admin/panel";
import { isValidPath, isValidRef, safeParseJsonRequest } from "@/shared/web";
import {
  PROFILE_README_PATH,
  PROFILE_REPO_SLUG,
  validateRepoSlugForRoute,
  validateSlugForRoute,
} from "@/shared/slugs";
import { json, newPrefixedId } from "@/worker/common";
import { commitRepositoryFile } from "@/worker/git/commitFile";
import {
  findNamespaceById,
  findNamespaceBySlug,
  findRepositoryById,
  getRepositoryMeta,
  insertRepositoryIfNew,
  listRepositoriesForUser,
  updateRepositoryVisibility,
  upsertRepositoryMeta,
} from "@/worker/db/d1/dal";
import { sameOriginViolation } from "@/worker/auth/origin";
import { loadViewer } from "@/worker/auth/session";
import { viewerIsNamespaceMember } from "@/worker/auth/pat";
import type { AppRouter } from "./hono";
import { enqueueRouteCacheSync } from "./authShared";
import {
  ProfileReadmeUpdateRequestSchema,
  RepoFileUpdateRequestSchema,
  RepositoryCreateRequestSchema,
  RepositoryPatchRequestSchema,
} from "./requestSchemas";

const MAX_WEB_COMMIT_BYTES = 256 * 1024;

export function registerAuthRepositoryRoutes(router: AppRouter) {
  router.get(`/auth/api/repositories`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) return json({ error: "Unauthorized" }, 401);
    const rows = await listRepositoriesForUser(c.var.db, viewer.userId);
    return json({
      repositories: rows.map((row) => ({
        id: row.repository.id,
        slug: row.repository.slug,
        namespaceSlug: row.namespace.slug,
        visibility: row.repository.visibility,
        updatedAt: row.repository.updatedAt,
      })),
    });
  });

  router.post(`/auth/api/repositories`, async (c) => {
    const log = c.var.logFor({ service: "RepoCreate" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("repo-create:same-origin-violation");
      return violation;
    }
    const viewer = await loadViewer(c);
    if (!viewer) {
      log.info("repo-create:not-authenticated");
      return json({ error: "Unauthorized" }, 401);
    }
    if (!canWriteRepositories(viewer.role)) {
      log.warn("repo-create:viewer-read-only", { userId: viewer.userId, role: viewer.role });
      return json({ ok: false, reason: "viewer-read-only" } as const, 403);
    }
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsedBody = RepositoryCreateRequestSchema.safeParse(rawBody);
    const body = parsedBody.success
      ? parsedBody.data
      : {
          namespaceSlug: "",
          slug: "",
          visibility: null,
          description: "",
          initializeReadme: false,
          initializeProfileReadme: false,
        };
    if (body.visibility === null) {
      log.warn("repo-create:invalid-visibility");
      return json({ ok: false, reason: "invalid-visibility" } as const, 400);
    }
    const visibility = body.visibility;
    const namespaceValidation = validateSlugForRoute(body.namespaceSlug);
    if (!namespaceValidation.ok) {
      log.warn("repo-create:invalid-slug", { field: "namespaceSlug" });
      return json({ ok: false, reason: "invalid-slug" } as const, 400);
    }
    const slugValidation = validateRepoSlugForRoute(body.slug);
    if (!slugValidation.ok) {
      log.warn("repo-create:invalid-slug", { field: "slug", slug: body.slug });
      return json({ ok: false, reason: "invalid-slug" } as const, 400);
    }
    const db = c.var.db;
    const namespace = await findNamespaceBySlug(db, namespaceValidation.slug);
    if (!namespace) {
      log.warn("repo-create:namespace-not-found", { namespaceSlug: namespaceValidation.slug });
      return json({ ok: false, reason: "namespace-not-found" } as const, 404);
    }
    if (!(await viewerIsNamespaceMember(db, viewer.userId, namespace.id))) {
      log.warn("repo-create:not-member", {
        userId: viewer.userId,
        namespaceId: namespace.id,
      });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }
    const now = Date.now();
    const repositoryId = newPrefixedId("repo");
    // Fresh repositories use an opaque RepoDO storage identity. Existing D1
    // rows may store a slash-shaped `doName`, so the `repo:` prefix keeps new
    // identities unambiguous without inspecting URL slugs.
    const doName = `repo:${repositoryId.slice("repo_".length)}`;
    const inserted = await insertRepositoryIfNew(db, {
      id: repositoryId,
      namespaceId: namespace.id,
      createdBy: viewer.userId,
      slug: slugValidation.slug,
      doName,
      visibility,
      createdAt: now,
      updatedAt: now,
    });
    if (!inserted) {
      // Race lost: another writer committed `(namespaceId, slug)` between
      // our membership check and the insert. The user sees this as
      // slug-taken and can pick another name.
      log.warn("repo-create:slug-taken", {
        namespaceId: namespace.id,
        slug: slugValidation.slug,
      });
      return json({ ok: false, reason: "slug-taken" } as const, 409);
    }

    enqueueRouteCacheSync(c, log, {
      repositoryId: inserted.id,
      namespaceSlug: namespaceValidation.slug,
      repoSlug: slugValidation.slug,
    });

    const cleanDescription = sanitizeRepoDescription(body.description);
    if (cleanDescription) {
      await upsertRepositoryMeta(c.env.DB, inserted.id, {
        description: cleanDescription,
        now,
      });
    }

    let profileReadmeInitialized = false;
    let readmeInitialized = false;
    if (slugValidation.slug === PROFILE_REPO_SLUG && body.initializeProfileReadme) {
      const template = buildDefaultProfileReadmeTemplate(
        namespaceValidation.slug,
        viewer.displayName
      );
      const committed = await commitRepositoryFile({
        env: c.env,
        db,
        limiter: c.var.limiter,
        log,
        cacheCtx: c.var.cacheCtx,
        repositoryId: inserted.id,
        doName: inserted.doName,
        filePath: PROFILE_README_PATH,
        content: template,
        commitMessage: `Initialize ${PROFILE_README_PATH}`,
        authorName: viewer.displayName || namespaceValidation.slug,
        authorEmail: `${namespaceValidation.slug}@local.dev`,
      });
      profileReadmeInitialized = committed.ok;
    } else if (body.initializeReadme) {
      const template = buildDefaultRepoReadmeTemplate(
        namespaceValidation.slug,
        slugValidation.slug,
        cleanDescription
      );
      const committed = await commitRepositoryFile({
        env: c.env,
        db,
        limiter: c.var.limiter,
        log,
        cacheCtx: c.var.cacheCtx,
        repositoryId: inserted.id,
        doName: inserted.doName,
        filePath: "README.md",
        content: template,
        commitMessage: "Initialize README.md",
        authorName: viewer.displayName || namespaceValidation.slug,
        authorEmail: `${namespaceValidation.slug}@local.dev`,
      });
      readmeInitialized = committed.ok;
    }

    log.info("repo-create:ok", {
      userId: viewer.userId,
      repositoryId: inserted.id,
      namespaceSlug: namespaceValidation.slug,
      slug: slugValidation.slug,
      visibility,
      profileReadmeInitialized,
      readmeInitialized,
    });
    return json({
      ok: true,
      id: inserted.id,
      namespaceSlug: namespaceValidation.slug,
      slug: slugValidation.slug,
      visibility,
      description: cleanDescription,
      pinned: false,
      updatedAt: now,
      profileReadmeInitialized,
      readmeInitialized,
    } as const);
  });

  router.patch(`/auth/api/repositories/:repositoryId`, async (c) => {
    const log = c.var.logFor({ service: "RepoVisibility" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("repo-visibility:same-origin-violation");
      return violation;
    }
    const viewer = await loadViewer(c);
    if (!viewer) return json({ error: "Unauthorized" }, 401);
    if (!canWriteRepositories(viewer.role)) {
      log.warn("repo-visibility:viewer-read-only", { userId: viewer.userId, role: viewer.role });
      return json({ ok: false, reason: "viewer-read-only" } as const, 403);
    }
    const repositoryId = c.req.param("repositoryId");
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsedBody = RepositoryPatchRequestSchema.safeParse(rawBody);
    const data = parsedBody.success ? parsedBody.data : undefined;
    const hasVisibility = data?.visibility !== undefined;
    const hasDescription = data?.description !== undefined;
    const hasPinned = data?.pinned !== undefined;
    if (!data || data.visibility === null || (!hasVisibility && !hasDescription && !hasPinned)) {
      log.warn("repo-visibility:invalid-payload", { repositoryId });
      return json({ ok: false, reason: "invalid-payload" } as const, 400);
    }
    const db = c.var.db;
    const repo = await findRepositoryById(db, repositoryId);
    if (!repo) {
      log.warn("repo-visibility:not-found", { repositoryId });
      return json({ ok: false, reason: "not-found" } as const, 404);
    }
    if (!(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
      log.warn("repo-visibility:not-member", {
        userId: viewer.userId,
        repositoryId,
        namespaceId: repo.namespaceId,
      });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }

    const now = Date.now();
    let previousVisibility = repo.visibility;
    let currentVisibility = repo.visibility;
    if (data.visibility) {
      const result = await updateRepositoryVisibility(db, repositoryId, data.visibility, now);
      if (!result.ok) {
        log.warn("repo-visibility:not-found", { repositoryId });
        return json({ ok: false, reason: "not-found" } as const, 404);
      }
      previousVisibility = result.previous;
      currentVisibility = result.current;
      if (result.previous !== result.current) {
        // Reconcile ROUTES KV via the queue.
        const namespace = await findNamespaceById(db, repo.namespaceId);
        if (namespace) {
          enqueueRouteCacheSync(c, log, {
            repositoryId,
            namespaceSlug: namespace.slug,
            repoSlug: repo.slug,
          });
        } else {
          log.warn("repo-visibility:namespace-missing-for-sync", {
            repositoryId,
            namespaceId: repo.namespaceId,
          });
        }
      }
    }

    const updatedMeta =
      hasDescription || hasPinned
        ? await upsertRepositoryMeta(c.env.DB, repositoryId, {
            description: data.description,
            pinned: data.pinned,
            now,
          })
        : await getRepositoryMeta(c.env.DB, repositoryId);

    log.info("repo-visibility:ok", {
      userId: viewer.userId,
      repositoryId,
      previous: previousVisibility,
      current: currentVisibility,
      pinned: updatedMeta.pinned,
    });
    return json({
      ok: true,
      id: repositoryId,
      visibility: currentVisibility,
      previous: previousVisibility,
      description: updatedMeta.description,
      pinned: updatedMeta.pinned,
    } as const);
  });

  // Web editor endpoint to save & commit `profile/README.md` inside `.vibtools`.
  router.put(`/auth/api/repositories/:repositoryId/profile-readme`, async (c) => {
    const log = c.var.logFor({ service: "ProfileReadmeCommit" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("profile-readme:same-origin-violation");
      return violation;
    }
    const viewer = await loadViewer(c);
    if (!viewer) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!canWriteRepositories(viewer.role)) {
      log.warn("profile-readme:viewer-read-only", { userId: viewer.userId, role: viewer.role });
      return json({ ok: false, reason: "viewer-read-only" } as const, 403);
    }

    const repositoryId = c.req.param("repositoryId");
    const db = c.var.db;
    const repo = await findRepositoryById(db, repositoryId);
    if (!repo) {
      return json({ ok: false, reason: "not-found" } as const, 404);
    }
    if (repo.slug !== PROFILE_REPO_SLUG) {
      return json({ ok: false, reason: "not-profile-repo" } as const, 400);
    }
    if (!(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
      log.warn("profile-readme:not-member", {
        userId: viewer.userId,
        repositoryId,
        namespaceId: repo.namespaceId,
      });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = ProfileReadmeUpdateRequestSchema.safeParse(rawBody);
    const content = parsed.success ? parsed.data.content : "";
    const message = parsed.success ? parsed.data.message : "";

    if (new TextEncoder().encode(content).byteLength > MAX_WEB_COMMIT_BYTES) {
      return json({ ok: false, reason: "too-large" } as const, 400);
    }

    const namespace = await findNamespaceById(db, repo.namespaceId);
    const authorSlug = viewer.primaryNamespaceSlug || namespace?.slug || "user";
    const result = await commitRepositoryFile({
      env: c.env,
      db,
      limiter: c.var.limiter,
      log,
      cacheCtx: c.var.cacheCtx,
      repositoryId: repo.id,
      doName: repo.doName,
      filePath: PROFILE_README_PATH,
      content,
      commitMessage: message || `Update ${PROFILE_README_PATH}`,
      authorName: viewer.displayName || authorSlug,
      authorEmail: `${authorSlug}@local.dev`,
    });

    if (!result.ok) {
      const status = result.reason === "repo-busy" ? 409 : 500;
      return json({ ok: false, reason: result.reason, detail: result.detail } as const, status);
    }

    return json({
      ok: true,
      commitOid: result.commitOid,
      ref: result.ref,
      unchanged: result.unchanged,
    } as const);
  });

  // General browser editor endpoint to create or edit any text file on a branch.
  router.put(`/auth/api/repositories/:repositoryId/file`, async (c) => {
    const log = c.var.logFor({ service: "WebFileCommit" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("web-file:same-origin-violation");
      return violation;
    }
    const viewer = await loadViewer(c);
    if (!viewer) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!canWriteRepositories(viewer.role)) {
      log.warn("web-file:viewer-read-only", { userId: viewer.userId, role: viewer.role });
      return json({ ok: false, reason: "viewer-read-only" } as const, 403);
    }

    const repositoryId = c.req.param("repositoryId");
    const db = c.var.db;
    const repo = await findRepositoryById(db, repositoryId);
    if (!repo) {
      return json({ ok: false, reason: "not-found" } as const, 404);
    }
    if (!(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
      log.warn("web-file:not-member", {
        userId: viewer.userId,
        repositoryId,
        namespaceId: repo.namespaceId,
      });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = RepoFileUpdateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, reason: "invalid-payload" } as const, 400);
    }

    const cleanPath = parsed.data.path.replace(/^\/+/, "");
    if (!cleanPath || !isValidPath(cleanPath)) {
      return json({ ok: false, reason: "invalid-path" } as const, 400);
    }
    if (parsed.data.ref && !isValidRef(parsed.data.ref)) {
      return json({ ok: false, reason: "invalid-ref" } as const, 400);
    }
    if (new TextEncoder().encode(parsed.data.content).byteLength > MAX_WEB_COMMIT_BYTES) {
      return json({ ok: false, reason: "too-large" } as const, 400);
    }

    const namespace = await findNamespaceById(db, repo.namespaceId);
    const authorSlug = viewer.primaryNamespaceSlug || namespace?.slug || "user";
    const result = await commitRepositoryFile({
      env: c.env,
      db,
      limiter: c.var.limiter,
      log,
      cacheCtx: c.var.cacheCtx,
      repositoryId: repo.id,
      doName: repo.doName,
      filePath: cleanPath,
      content: parsed.data.content,
      commitMessage: parsed.data.message || `Update ${cleanPath}`,
      authorName: viewer.displayName || authorSlug,
      authorEmail: `${authorSlug}@local.dev`,
      targetRef: parsed.data.ref || undefined,
    });

    if (!result.ok) {
      const status =
        result.reason === "repo-busy" ? 409 : result.reason === "invalid-path" ? 400 : 500;
      return json({ ok: false, reason: result.reason, detail: result.detail } as const, status);
    }

    return json({
      ok: true,
      path: cleanPath,
      commitOid: result.commitOid,
      ref: result.ref,
      unchanged: result.unchanged,
    } as const);
  });
}
