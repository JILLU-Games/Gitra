import {
  buildDefaultProfileReadmeTemplate,
  buildDefaultRepoReadmeTemplate,
  canAccessAdminPanel,
  canWriteRepositories,
  evaluateRepositoryPatchPolicy,
  sanitizeRepoDescription,
} from "@/shared/admin/panel";
import { isValidPath, isValidRef, safeParseJsonRequest } from "@/shared/web";
import {
  PROFILE_README_PATH,
  PROFILE_REPO_SLUG,
  validateRepoSlugForRoute,
  validateSlugForRoute,
} from "@/shared/slugs";
import type { Viewer } from "@/client/server/viewer";
import type { Db } from "@/worker/db/d1/client";
import { json, newPrefixedId } from "@/worker/common";
import { commitRepositoryFile, commitRepositoryMutation } from "@/worker/git/commitFile";
import {
  findNamespaceById,
  findNamespaceBySlug,
  findRepositoryById,
  getNamespaceProfileMeta,
  getRepositoryMeta,
  insertRepositoryIfNew,
  listRepositoriesForUser,
  updateRepositoryVisibility,
  upsertRepositoryMeta,
} from "@/worker/db/d1/dal";
import { sameOriginViolation } from "@/worker/auth/origin";
import { loadViewer } from "@/worker/auth/session";
import { viewerIsNamespaceMember } from "@/worker/auth/pat";
import type { AppContext, AppRouter } from "./hono";
import { enqueueRouteCacheSync } from "./authShared";
import {
  ProfileReadmeUpdateRequestSchema,
  RepoFileDeleteRequestSchema,
  RepoFileMoveRequestSchema,
  RepoFileUpdateRequestSchema,
  RepositoryCreateRequestSchema,
  RepositoryPatchRequestSchema,
} from "./requestSchemas";

const MAX_WEB_COMMIT_BYTES = 256 * 1024;
const MAX_WEB_UPLOAD_BYTES = 2 * 1024 * 1024;

function buildNoReplyEmail(reqUrl: string, slug: string): string {
  let host = "localhost";
  try {
    host = new URL(reqUrl).hostname || "localhost";
  } catch {
    host = "localhost";
  }
  return `${slug}@users.noreply.${host}`;
}

async function resolveViewerCommitEmail(
  c: AppContext,
  db: Db,
  viewer: Viewer,
  authorSlug: string,
  fallbackNamespaceId: string
): Promise<string> {
  let metaNamespaceId: string | null = fallbackNamespaceId;
  if (viewer.primaryNamespaceSlug) {
    const primaryNs = await findNamespaceBySlug(db, viewer.primaryNamespaceSlug);
    if (primaryNs) {
      metaNamespaceId = primaryNs.id;
    }
  }
  if (metaNamespaceId) {
    const profileMeta = await getNamespaceProfileMeta(c.env.DB, metaNamespaceId);
    if (profileMeta.commitEmail) {
      return profileMeta.commitEmail;
    }
  }
  return buildNoReplyEmail(c.req.url, authorSlug);
}

function decodeBase64Bytes(rawBase64: string): Uint8Array | null {
  const trimmed = rawBase64.replace(/\s+/g, "");
  if (!trimmed) return new Uint8Array(0);
  try {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function requireWritableRepoAccess(
  c: AppContext,
  logService: string
): Promise<
  | {
      kind: "ok";
      viewer: Viewer;
      repo: NonNullable<Awaited<ReturnType<typeof findRepositoryById>>>;
    }
  | { kind: "response"; response: Response }
> {
  const log = c.var.logFor({ service: logService });
  const violation = sameOriginViolation(c);
  if (violation) {
    log.warn("web-file:same-origin-violation");
    return { kind: "response", response: violation };
  }
  const viewer = await loadViewer(c);
  if (!viewer) {
    return { kind: "response", response: json({ error: "Unauthorized" }, 401) };
  }
  if (!canWriteRepositories(viewer.role)) {
    log.warn("web-file:viewer-read-only", { userId: viewer.userId, role: viewer.role });
    return {
      kind: "response",
      response: json({ ok: false, reason: "viewer-read-only" } as const, 403),
    };
  }

  const repositoryId = c.req.param("repositoryId") || "";
  const db = c.var.db;
  const repo = await findRepositoryById(db, repositoryId);
  if (!repo) {
    return { kind: "response", response: json({ ok: false, reason: "not-found" } as const, 404) };
  }
  if (
    !canAccessAdminPanel(viewer.role) &&
    !(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))
  ) {
    log.warn("web-file:not-member", {
      userId: viewer.userId,
      repositoryId,
      namespaceId: repo.namespaceId,
    });
    return { kind: "response", response: json({ ok: false, reason: "not-member" } as const, 403) };
  }

  return { kind: "ok", viewer, repo };
}

function mapCommitMutationFailure(result: {
  reason: "invalid-path" | "invalid-ref" | "not-found" | "repo-busy" | "commit-failed";
  detail?: string;
}): Response {
  const status =
    result.reason === "repo-busy"
      ? 409
      : result.reason === "not-found"
        ? 404
        : result.reason === "invalid-path" || result.reason === "invalid-ref"
          ? 400
          : 500;
  return json({ ok: false, reason: result.reason, detail: result.detail } as const, status);
}

export async function handleRepositoryPatch(
  c: AppContext,
  repositoryId: string,
  options?: { requireAdmin?: boolean }
): Promise<Response> {
  const log = c.var.logFor({ service: "RepoVisibility" });
  const violation = sameOriginViolation(c);
  if (violation) {
    log.warn("repo-visibility:same-origin-violation");
    return violation;
  }
  const viewer = await loadViewer(c);
  if (!viewer) return json({ error: "Unauthorized" }, 401);
  if (options?.requireAdmin && !canAccessAdminPanel(viewer.role)) {
    log.warn("repo-visibility:admin-required", { userId: viewer.userId, role: viewer.role });
    return json({ ok: false, reason: "admin-required" } as const, 403);
  }
  if (!canWriteRepositories(viewer.role)) {
    log.warn("repo-visibility:viewer-read-only", { userId: viewer.userId, role: viewer.role });
    return json({ ok: false, reason: "viewer-read-only" } as const, 403);
  }

  const rawBody = await safeParseJsonRequest(c.req.raw);
  const parsedBody = RepositoryPatchRequestSchema.safeParse(rawBody);
  const data = parsedBody.success ? parsedBody.data : undefined;
  const hasVisibility = data?.visibility !== undefined;
  const hasDescription = data?.description !== undefined;
  const hasPinned = data?.pinned !== undefined;
  const hasHomePinned = data?.homePinned !== undefined;
  if (
    !data ||
    data.visibility === null ||
    (!hasVisibility && !hasDescription && !hasPinned && !hasHomePinned)
  ) {
    log.warn("repo-visibility:invalid-payload", { repositoryId });
    return json({ ok: false, reason: "invalid-payload" } as const, 400);
  }

  const db = c.var.db;
  const repo = await findRepositoryById(db, repositoryId);
  if (!repo) {
    log.warn("repo-visibility:not-found", { repositoryId });
    return json({ ok: false, reason: "not-found" } as const, 404);
  }

  const isMember = await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId);
  const policy = evaluateRepositoryPatchPolicy({
    viewerRole: viewer.role,
    isNamespaceMember: isMember,
    hasHomePinned,
    requestedHomePinned: data.homePinned,
    currentVisibility: repo.visibility,
    requestedVisibility: data.visibility ?? undefined,
  });
  if (!policy.ok) {
    log.warn("repo-visibility:policy-denied", {
      userId: viewer.userId,
      repositoryId,
      namespaceId: repo.namespaceId,
      reason: policy.reason,
    });
    return json({ ok: false, reason: policy.reason } as const, policy.status);
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

  // Private repositories must never retain a stale homepage feature flag.
  const nextHomePinnedPatch =
    data.homePinned !== undefined
      ? data.homePinned
      : currentVisibility === "private"
        ? false
        : undefined;

  const updatedMeta =
    hasDescription || hasPinned || nextHomePinnedPatch !== undefined
      ? await upsertRepositoryMeta(c.env.DB, repositoryId, {
          description: data.description,
          pinned: data.pinned,
          homePinned: nextHomePinnedPatch,
          now,
        })
      : await getRepositoryMeta(c.env.DB, repositoryId);

  log.info("repo-visibility:ok", {
    userId: viewer.userId,
    repositoryId,
    previous: previousVisibility,
    current: currentVisibility,
    pinned: updatedMeta.pinned,
    homePinned: updatedMeta.homePinned,
  });
  return json({
    ok: true,
    id: repositoryId,
    visibility: currentVisibility,
    previous: previousVisibility,
    description: updatedMeta.description,
    pinned: updatedMeta.pinned,
    homePinned: updatedMeta.homePinned,
  } as const);
}

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
    const isMember = await viewerIsNamespaceMember(db, viewer.userId, namespace.id);
    if (!canAccessAdminPanel(viewer.role) && !isMember) {
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
    const initAuthorSlug = viewer.primaryNamespaceSlug || namespaceValidation.slug;
    if (
      (slugValidation.slug === PROFILE_REPO_SLUG && body.initializeProfileReadme) ||
      body.initializeReadme
    ) {
      const authorEmail = await resolveViewerCommitEmail(
        c,
        db,
        viewer,
        initAuthorSlug,
        namespace.id
      );
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
          authorName: viewer.displayName || initAuthorSlug,
          authorEmail,
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
          authorName: viewer.displayName || initAuthorSlug,
          authorEmail,
        });
        readmeInitialized = committed.ok;
      }
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
      defaultBranch: "main",
      description: cleanDescription,
      pinned: false,
      homePinned: false,
      updatedAt: now,
      profileReadmeInitialized,
      readmeInitialized,
    } as const);
  });

  router.patch(`/auth/api/repositories/:repositoryId`, (c) =>
    handleRepositoryPatch(c, c.req.param("repositoryId"))
  );

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
    if (
      !canAccessAdminPanel(viewer.role) &&
      !(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))
    ) {
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
    const authorEmail = await resolveViewerCommitEmail(c, db, viewer, authorSlug, repo.namespaceId);
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
      authorEmail,
    });

    if (!result.ok) {
      return mapCommitMutationFailure(result);
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
    const access = await requireWritableRepoAccess(c, "WebFileCommit");
    if (access.kind === "response") return access.response;
    const { viewer, repo } = access;
    const db = c.var.db;

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
    const authorEmail = await resolveViewerCommitEmail(c, db, viewer, authorSlug, repo.namespaceId);
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
      authorEmail,
      targetRef: parsed.data.ref || undefined,
    });

    if (!result.ok) {
      return mapCommitMutationFailure(result);
    }

    return json({
      ok: true,
      path: cleanPath,
      commitOid: result.commitOid,
      ref: result.ref,
      unchanged: result.unchanged,
    } as const);
  });

  // Upload a text or binary file directly onto a branch via multipart/form-data or base64 JSON.
  router.post(`/auth/api/repositories/:repositoryId/file/upload`, async (c) => {
    const log = c.var.logFor({ service: "WebFileUpload" });
    const access = await requireWritableRepoAccess(c, "WebFileUpload");
    if (access.kind === "response") return access.response;
    const { viewer, repo } = access;
    const db = c.var.db;

    let rawPath = "";
    let message = "";
    let ref = "";
    let fileBytes: Uint8Array | null = null;

    const contentType = (c.req.header("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await c.req.raw.formData();
        const fileField = formData.get("file");
        const pathField = formData.get("path");
        const messageField = formData.get("message");
        const refField = formData.get("ref");
        if (typeof pathField === "string") rawPath = pathField.trim();
        if (typeof messageField === "string") message = messageField.trim();
        if (typeof refField === "string") ref = refField.trim();
        if (
          fileField &&
          typeof fileField !== "string" &&
          typeof fileField.arrayBuffer === "function"
        ) {
          if (!rawPath && typeof fileField.name === "string") {
            rawPath = (fileField.name.split(/[\\/]/).pop() || "").trim();
          }
          if (fileField.size > MAX_WEB_UPLOAD_BYTES) {
            return json({ ok: false, reason: "too-large" } as const, 400);
          }
          fileBytes = new Uint8Array(await fileField.arrayBuffer());
        }
      } catch {
        return json({ ok: false, reason: "invalid-payload" } as const, 400);
      }
    } else {
      const rawBody = await safeParseJsonRequest(c.req.raw);
      if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
        return json({ ok: false, reason: "invalid-payload" } as const, 400);
      }
      const obj = rawBody as Record<string, unknown>;
      rawPath = typeof obj.path === "string" ? obj.path.trim() : "";
      message = typeof obj.message === "string" ? obj.message.trim() : "";
      ref = typeof obj.ref === "string" ? obj.ref.trim() : "";
      if (typeof obj.contentBase64 === "string") {
        fileBytes = decodeBase64Bytes(obj.contentBase64);
      }
    }

    const cleanPath = rawPath.replace(/^\/+/, "");
    if (!cleanPath || !isValidPath(cleanPath)) {
      return json({ ok: false, reason: "invalid-path" } as const, 400);
    }
    if (ref && !isValidRef(ref)) {
      return json({ ok: false, reason: "invalid-ref" } as const, 400);
    }
    if (!fileBytes) {
      return json({ ok: false, reason: "missing-file" } as const, 400);
    }
    if (fileBytes.byteLength > MAX_WEB_UPLOAD_BYTES) {
      return json({ ok: false, reason: "too-large" } as const, 400);
    }

    const namespace = await findNamespaceById(db, repo.namespaceId);
    const authorSlug = viewer.primaryNamespaceSlug || namespace?.slug || "user";
    const authorEmail = await resolveViewerCommitEmail(c, db, viewer, authorSlug, repo.namespaceId);
    const result = await commitRepositoryFile({
      env: c.env,
      db,
      limiter: c.var.limiter,
      log,
      cacheCtx: c.var.cacheCtx,
      repositoryId: repo.id,
      doName: repo.doName,
      filePath: cleanPath,
      content: fileBytes,
      commitMessage: message || `Upload ${cleanPath}`,
      authorName: viewer.displayName || authorSlug,
      authorEmail,
      targetRef: ref || undefined,
    });

    if (!result.ok) {
      return mapCommitMutationFailure(result);
    }

    return json({
      ok: true,
      path: cleanPath,
      bytes: fileBytes.byteLength,
      commitOid: result.commitOid,
      ref: result.ref,
      unchanged: result.unchanged,
    } as const);
  });

  // Delete a single file from a branch (automatically prunes emptied parent directories).
  router.delete(`/auth/api/repositories/:repositoryId/file`, async (c) => {
    const log = c.var.logFor({ service: "WebFileDelete" });
    const access = await requireWritableRepoAccess(c, "WebFileDelete");
    if (access.kind === "response") return access.response;
    const { viewer, repo } = access;
    const db = c.var.db;

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = RepoFileDeleteRequestSchema.safeParse(rawBody);
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

    const namespace = await findNamespaceById(db, repo.namespaceId);
    const authorSlug = viewer.primaryNamespaceSlug || namespace?.slug || "user";
    const authorEmail = await resolveViewerCommitEmail(c, db, viewer, authorSlug, repo.namespaceId);
    const result = await commitRepositoryMutation({
      env: c.env,
      db,
      limiter: c.var.limiter,
      log,
      cacheCtx: c.var.cacheCtx,
      repositoryId: repo.id,
      doName: repo.doName,
      operation: {
        kind: "delete",
        filePath: cleanPath,
      },
      commitMessage: parsed.data.message || `Delete ${cleanPath}`,
      authorName: viewer.displayName || authorSlug,
      authorEmail,
      targetRef: parsed.data.ref || undefined,
    });

    if (!result.ok) {
      return mapCommitMutationFailure(result);
    }

    return json({
      ok: true,
      path: cleanPath,
      commitOid: result.commitOid,
      ref: result.ref,
      unchanged: result.unchanged,
    } as const);
  });

  // Rename or move a file (preserving content and file mode) on a branch.
  router.post(`/auth/api/repositories/:repositoryId/file/move`, async (c) => {
    const log = c.var.logFor({ service: "WebFileMove" });
    const access = await requireWritableRepoAccess(c, "WebFileMove");
    if (access.kind === "response") return access.response;
    const { viewer, repo } = access;
    const db = c.var.db;

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = RepoFileMoveRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, reason: "invalid-payload" } as const, 400);
    }

    const cleanFrom = parsed.data.fromPath.replace(/^\/+/, "");
    const cleanTo = parsed.data.toPath.replace(/^\/+/, "");
    if (!cleanFrom || !cleanTo || !isValidPath(cleanFrom) || !isValidPath(cleanTo)) {
      return json({ ok: false, reason: "invalid-path" } as const, 400);
    }
    if (parsed.data.ref && !isValidRef(parsed.data.ref)) {
      return json({ ok: false, reason: "invalid-ref" } as const, 400);
    }

    const namespace = await findNamespaceById(db, repo.namespaceId);
    const authorSlug = viewer.primaryNamespaceSlug || namespace?.slug || "user";
    const authorEmail = await resolveViewerCommitEmail(c, db, viewer, authorSlug, repo.namespaceId);
    const result = await commitRepositoryMutation({
      env: c.env,
      db,
      limiter: c.var.limiter,
      log,
      cacheCtx: c.var.cacheCtx,
      repositoryId: repo.id,
      doName: repo.doName,
      operation: {
        kind: "move",
        fromPath: cleanFrom,
        toPath: cleanTo,
      },
      commitMessage: parsed.data.message || `Rename ${cleanFrom} to ${cleanTo}`,
      authorName: viewer.displayName || authorSlug,
      authorEmail,
      targetRef: parsed.data.ref || undefined,
    });

    if (!result.ok) {
      return mapCommitMutationFailure(result);
    }

    return json({
      ok: true,
      fromPath: cleanFrom,
      toPath: cleanTo,
      commitOid: result.commitOid,
      ref: result.ref,
      unchanged: result.unchanged,
    } as const);
  });
}
