import {
  canAccessAdminPanel,
  canRemoveNamespaceEntry,
  evaluatePrimaryAdminPatchPolicy,
  formatPatScopeLabel,
  GLOBAL_PAT_TARGET_LABEL,
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
import {
  isSiteBrandingAssetSlot,
  MAX_BRANDING_ASSET_BYTES,
  validateBrandingAssetBytes,
  type SiteBrandingAssetSlot,
} from "@/shared/branding";
import { safeParseJsonRequest } from "@/shared/web";
import type { Viewer } from "@/client/server/viewer";
import {
  buildLocalAccountSubject,
  resolveAdminAuthConfig,
  resolveAdminAuthSource,
  resolveInitialAdminNamespaceSlug,
} from "@/worker/auth/adminAuth";
import { sameOriginViolation } from "@/worker/auth/origin";
import { hashPassword } from "@/worker/auth/passwords";
import { viewerIsNamespaceMember } from "@/worker/auth/pat";
import { createSessionForUser, loadViewer } from "@/worker/auth/session";
import { getRepoStub, json, newPrefixedId } from "@/worker/common";
import {
  deleteSiteBrandingAsset,
  getSiteBrandingAsset,
  loadSiteBranding,
  putSiteBrandingAsset,
  saveSiteBranding,
  siteBrandingAssetUrl,
} from "@/worker/branding";
import {
  claimNamespace,
  deleteNamespaceEntry,
  findNamespaceById,
  findNamespaceBySlug,
  findNamespaceDirectoryMeta,
  findRepositoryById,
  findUserBySubject,
  insertMembershipIfMissing,
  insertUserIfNew,
  listAllNamespaceDirectoryEntries,
  listAllPatsWithOwners,
  listAllRepositoriesWithNamespaces,
  listRepositoriesInNamespace,
  listRepositoryMetaMap,
  resolvePrimaryAdminNamespace,
  revokePatAsAdmin,
  updateNamespaceHandle,
  upsertNamespaceDirectoryMeta,
} from "@/worker/db/d1/dal";
import {
  countSubrequest,
  DEFAULT_SUBREQUEST_BUDGET,
  type Limiter,
} from "@/worker/git/operations/limits";
import { deleteRouteCacheRecord } from "@/worker/repositories/routeCache";
import { dispatchRepositoryDelete } from "@/worker/tasks/dispatch";
import { handleRepositoryPatch } from "./authRepositories";
import { enqueueRouteCacheSync, safeRedirect, summarizeTokens } from "./authShared";
import type { RepositoryDeleteMessage } from "@/worker/tasks/queue";
import { workerExecutionContext, type AppContext, type AppRouter } from "./hono";
import {
  AdminNamespaceCreateRequestSchema,
  AdminNamespacePatchRequestSchema,
  AdminRepositoryDeleteRequestSchema,
  AdminSettingsUpdateRequestSchema,
} from "./requestSchemas";
import { renderUiDocumentResponse } from "./uiResponse";

const REPO_BRANCH_KV_PREFIX = "repo-branch:";
const MAX_COLD_BRANCH_LOOKUPS = 60;
const COLD_BRANCH_SUBREQUEST_HEADROOM = 100;
const UNRESOLVED_COLD_BRANCH_PLACEHOLDER = "...";

async function resolvePrimaryAdminNamespaceId(c: AppContext): Promise<string | null> {
  const ns = await resolvePrimaryAdminNamespace(c.env.DB, c.var.db, c.env);
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

function resolveRequestOrigin(c: AppContext): string {
  const url = new URL(c.req.url);
  const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost =
    c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host")?.trim();
  return forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : url.origin;
}

async function resolveDefaultBranch(
  c: AppContext,
  limiter: Limiter,
  doName: string
): Promise<string> {
  try {
    countSubrequest(c.var.cacheCtx, 1);
    const stub = getRepoStub(c.env, doName);
    const head = await limiter.run("do:system-admin-head", async () => await stub.getHead());
    if (head && typeof head.target === "string" && head.target.length > 0) {
      return shortRefName(head.target);
    }
  } catch {
    // Empty or uninitialized DO falls back cleanly to the default branch name.
  }
  return "main";
}

type CachedRepoBranch = {
  branch: string;
  updatedAt: number;
};

async function resolveCachedDefaultBranches(
  c: AppContext,
  limiter: Limiter,
  repoRows: ReadonlyArray<{ id: string; doName: string; updatedAt: number }>
): Promise<Map<string, string>> {
  const branchById = new Map<string, string>();
  const kv = c.env.ROUTES;
  const uncached: Array<{ id: string; doName: string; updatedAt: number }> = [];

  if (kv && typeof kv.get === "function") {
    const cachedEntries = await Promise.all(
      repoRows.map(async (row) => {
        try {
          const raw = await kv.get(`${REPO_BRANCH_KV_PREFIX}${row.id}`);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as Partial<CachedRepoBranch>;
          if (
            typeof parsed.branch === "string" &&
            parsed.branch.length > 0 &&
            parsed.updatedAt === row.updatedAt
          ) {
            return { id: row.id, branch: parsed.branch };
          }
        } catch {
          // Malformed KV entry triggers a live DO read below.
        }
        return null;
      })
    );
    cachedEntries.forEach((hit, index) => {
      const row = repoRows[index]!;
      if (hit) {
        branchById.set(row.id, hit.branch);
      } else {
        uncached.push(row);
      }
    });
  } else {
    uncached.push(...repoRows);
  }

  // Bound cold-cache DO lookups by both MAX_COLD_BRANCH_LOOKUPS and remaining
  // request subrequest headroom, while caching resolved branches in ROUTES KV
  // keyed by repo updatedAt. Any overflow beyond the cold lookup budget is marked
  // "..." (instead of silently faking "main") and warmed asynchronously.
  const currentBudget = c.var.cacheCtx.memo?.subreqBudget ?? DEFAULT_SUBREQUEST_BUDGET;
  const availableHeadroom = Math.max(0, currentBudget - COLD_BRANCH_SUBREQUEST_HEADROOM);
  const coldLookupLimit = Math.min(MAX_COLD_BRANCH_LOOKUPS, availableHeadroom);

  const toResolve = uncached.slice(0, coldLookupLimit);
  const overflow = uncached.slice(coldLookupLimit);
  for (const row of overflow) {
    branchById.set(row.id, UNRESOLVED_COLD_BRANCH_PLACEHOLDER);
  }

  if (toResolve.length > 0) {
    const resolved = await Promise.all(
      toResolve.map(async (row) => ({
        row,
        branch: await resolveDefaultBranch(c, limiter, row.doName),
      }))
    );
    const kvWrites: Promise<void>[] = [];
    for (const { row, branch } of resolved) {
      branchById.set(row.id, branch);
      if (kv && typeof kv.put === "function") {
        const payload: CachedRepoBranch = { branch, updatedAt: row.updatedAt };
        kvWrites.push(kv.put(`${REPO_BRANCH_KV_PREFIX}${row.id}`, JSON.stringify(payload)));
      }
    }
    if (kvWrites.length > 0) {
      try {
        c.executionCtx.waitUntil(Promise.allSettled(kvWrites));
      } catch {
        await Promise.allSettled(kvWrites);
      }
    }
  }

  if (overflow.length > 0 && kv && typeof kv.put === "function") {
    const backgroundBatch = overflow.slice(0, MAX_COLD_BRANCH_LOOKUPS);
    const warmTask = (async () => {
      for (const row of backgroundBatch) {
        const remaining = c.var.cacheCtx.memo?.subreqBudget ?? DEFAULT_SUBREQUEST_BUDGET;
        if (remaining <= COLD_BRANCH_SUBREQUEST_HEADROOM) break;
        const branch = await resolveDefaultBranch(c, limiter, row.doName);
        const payload: CachedRepoBranch = { branch, updatedAt: row.updatedAt };
        await kv.put(`${REPO_BRANCH_KV_PREFIX}${row.id}`, JSON.stringify(payload));
      }
    })().catch(() => {});
    try {
      c.executionCtx.waitUntil(warmTask);
    } catch {
      // No execution context available in direct unit calls.
    }
  }

  return branchById;
}

function summarizeAdminTokens(
  tokens: Awaited<ReturnType<typeof summarizeTokens>>,
  ownerSlugByPatId: ReadonlyMap<string, string | undefined>
): AdminTokenEntry[] {
  return tokens.map((token) => {
    const firstNs = token.namespaceGrants[0];
    const firstRepo = token.repoGrants[0];
    const level = token.globalGrant?.level ?? firstNs?.level ?? firstRepo?.level ?? "pull";
    const targetLabel = token.globalGrant
      ? GLOBAL_PAT_TARGET_LABEL
      : firstNs
        ? `@${firstNs.namespaceSlug}`
        : firstRepo
          ? `${firstRepo.namespaceSlug}/${firstRepo.repoSlug}`
          : "unscoped";
    return {
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      ownerSlug: ownerSlugByPatId.get(token.id),
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
  const [namespaces, repoRows, patEntries] = await Promise.all([
    loadDirectoryUsers(c),
    listAllRepositoriesWithNamespaces(db),
    listAllPatsWithOwners(db),
  ]);
  const patRows = patEntries.map((entry) => entry.pat);
  const ownerSlugByPatId = new Map(patEntries.map((entry) => [entry.pat.id, entry.ownerSlug]));

  const limiter = c.var.limiter;
  const [tokenSummaries, repoMeta, branchById] = await Promise.all([
    summarizeTokens(db, patRows, c.env.DB),
    listRepositoryMetaMap(
      c.env.DB,
      repoRows.map((row) => row.id)
    ),
    resolveCachedDefaultBranches(c, limiter, repoRows),
  ]);

  const repositories: AdminRepositoryEntry[] = repoRows.map((row) => {
    const meta = repoMeta.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      namespaceId: row.namespaceId,
      namespaceSlug: row.namespaceSlug,
      visibility: row.visibility,
      defaultBranch: branchById.get(row.id) ?? UNRESOLVED_COLD_BRANCH_PLACEHOLDER,
      pinned: meta?.pinned ?? false,
      homePinned: meta?.homePinned ?? false,
      updatedAt: row.updatedAt,
    };
  });

  return {
    origin: resolveRequestOrigin(c),
    primaryNamespaceSlug: viewer.primaryNamespaceSlug,
    namespaces,
    repositories,
    tokens: summarizeAdminTokens(tokenSummaries, ownerSlugByPatId),
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
          reason: pwValidation.reason === "too-short" ? "password-too-short" : "password-too-long",
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

  // Primary signed-in admin can update displayName and rename their public
  // `@namespace` handle without altering `ADMIN_USERNAME`, while remaining
  // protected from disable or demotion (and env/demo password override).
  const authSource = resolveAdminAuthSource(c.env);
  const policyCheck = evaluatePrimaryAdminPatchPolicy({
    isPrimaryAdmin,
    status: parsed.data.status,
    role: parsed.data.role,
    hasPasswordChange: parsed.data.password !== undefined,
    passwordManagedByEnv: authSource !== "d1",
  });
  if (!policyCheck.ok) {
    log.warn("system-admin:namespace-protected", { namespaceId });
    return json({ ok: false, reason: policyCheck.reason } as const, 400);
  }

  let nextPasswordHash: string | undefined;
  if (parsed.data.password !== undefined) {
    const pwValidation = validateUserPassword(parsed.data.password);
    if (!pwValidation.ok) {
      return json(
        {
          ok: false,
          reason: pwValidation.reason === "too-short" ? "password-too-short" : "password-too-long",
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
        buildLocalAccountSubject(slugResult.slug),
        { skipSubjectUpdate: isPrimaryAdmin, log }
      );
      if (!renamed) {
        return json({ ok: false, reason: "not-found" } as const, 404);
      }

      // Reconcile ROUTES KV for every repository in this namespace: drop stale
      // `oldSlug/repo` entries immediately and queue canonical syncs for `newSlug/repo`.
      const reposInNamespace = await listRepositoriesInNamespace(db, ns.id);
      if (reposInNamespace.length > 0) {
        c.executionCtx.waitUntil(
          Promise.allSettled(
            reposInNamespace.map((repo) => deleteRouteCacheRecord(c.env, ns.slug, repo.slug))
          )
        );
        for (const repo of reposInNamespace) {
          enqueueRouteCacheSync(c, log, {
            repositoryId: repo.id,
            namespaceSlug: ns.slug,
            repoSlug: repo.slug,
          });
        }
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

  const shouldBumpSessionEpoch =
    nextPasswordHash !== undefined ||
    (nextStatus === "disabled" && existingMeta?.status !== "disabled");

  const { sessionEpoch } = await upsertNamespaceDirectoryMeta(c.env.DB, ns.id, {
    displayName: nextDisplayName,
    role: nextRole,
    status: nextStatus,
    ...(nextPasswordHash !== undefined ? { passwordHash: nextPasswordHash } : {}),
    bumpSessionEpoch: shouldBumpSessionEpoch,
    lastActiveAt,
    now,
  });

  // If the signed-in primary admin rotated their own D1 password via /admin/users,
  // re-seal the caller's browser cookie while revoking all earlier sessions.
  if (nextPasswordHash !== undefined && viewer.userId === ns.createdBy) {
    try {
      await createSessionForUser(c.env, c, viewer.userId, now, sessionEpoch);
    } catch (error) {
      log.warn("system-admin:self-session-refresh-failed", {
        actor: viewer.userId,
        error: String(error),
      });
    }
  }

  log.info("system-admin:namespace-updated", {
    actor: viewer.userId,
    namespaceId: ns.id,
    slug: nextSlug,
    displayName: nextDisplayName,
    role: nextRole,
    status: nextStatus,
    passwordUpdated: nextPasswordHash !== undefined,
    sessionEpoch,
  });

  const response = json({
    ok: true,
    id: ns.id,
    slug: nextSlug,
    displayName: nextDisplayName,
    role: nextRole,
    status: nextStatus,
    lastActiveAt,
    hasPassword,
  } as const);
  c.res.headers.forEach((value, key) => {
    response.headers.append(key, value);
  });
  return response;
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

  // Enqueue full repository cleanup (ROUTES KV, R2 objects, DO storage)
  // before removing D1 rows so a queue outage fails safely without orphaning storage.
  const reposInNamespace = await listRepositoriesInNamespace(db, ns.id);
  const requestedAt = Date.now();
  if (reposInNamespace.length > 0) {
    try {
      for (const repo of reposInNamespace) {
        const message: RepositoryDeleteMessage = {
          kind: "repository-delete",
          repositoryId: repo.id,
          namespaceId: ns.id,
          namespaceSlug: ns.slug,
          repoSlug: repo.slug,
          doName: repo.doName,
          actor: viewer.userId,
          requestedAt,
        };
        await dispatchRepositoryDelete({
          env: c.env,
          ctx: workerExecutionContext(c),
          message,
          log,
        });
      }
    } catch (error) {
      log.error("system-admin:namespace-delete-enqueue-failed", {
        actor: viewer.userId,
        namespaceId: ns.id,
        repoCount: reposInNamespace.length,
        error: String(error),
      });
      return json(
        { ok: false, error: "Failed to enqueue repository cleanup; please retry" } as const,
        503
      );
    }
  }

  const removed = await deleteNamespaceEntry(c.env.DB, db, ns.id, ns.createdBy, viewer.userId);
  if (!removed) {
    return json({ ok: false, reason: "not-found" } as const, 404);
  }

  log.info("system-admin:namespace-removed", {
    actor: viewer.userId,
    namespaceId: ns.id,
    slug: ns.slug,
    queuedRepos: reposInNamespace.length,
  });

  return json({ ok: true, id: ns.id, queuedRepos: reposInNamespace.length } as const);
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
    const [data, branding] = await Promise.all([
      loadSystemAdminData(c, viewer),
      loadSiteBranding(c.env),
    ]);
    const authConfig = resolveAdminAuthConfig(c.env);
    return renderUiDocumentResponse(
      c.env,
      "system-admin",
      {
        ...data,
        activeSection: "overview",
        authMode: authConfig.mode,
      },
      {
        failureBody: "Failed to render admin panel\n",
        viewer,
        branding,
        origin: data.origin,
      }
    );
  });

  router.get(`/admin/repositories`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin%2Frepositories");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const [data, branding] = await Promise.all([
      loadSystemAdminData(c, viewer),
      loadSiteBranding(c.env),
    ]);
    const authConfig = resolveAdminAuthConfig(c.env);
    return renderUiDocumentResponse(
      c.env,
      "system-admin-repositories",
      {
        ...data,
        activeSection: "repositories",
        authMode: authConfig.mode,
      },
      {
        failureBody: "Failed to render admin repositories page\n",
        viewer,
        branding,
        origin: data.origin,
      }
    );
  });

  router.get(`/admin/tokens`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin%2Ftokens");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const [data, branding] = await Promise.all([
      loadSystemAdminData(c, viewer),
      loadSiteBranding(c.env),
    ]);
    const authConfig = resolveAdminAuthConfig(c.env);
    return renderUiDocumentResponse(
      c.env,
      "system-admin-tokens",
      {
        ...data,
        activeSection: "tokens",
        authMode: authConfig.mode,
      },
      {
        failureBody: "Failed to render admin access tokens page\n",
        viewer,
        branding,
        origin: data.origin,
      }
    );
  });

  router.get(`/admin/users`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin%2Fusers");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const [users, repoRows, patEntries, branding] = await Promise.all([
      loadDirectoryUsers(c),
      listAllRepositoriesWithNamespaces(c.var.db),
      listAllPatsWithOwners(c.var.db),
      loadSiteBranding(c.env),
    ]);
    const origin = resolveRequestOrigin(c);
    const authSource = resolveAdminAuthSource(c.env);
    const primaryAdminNamespaceSlug =
      users.find((u) => u.isPrimaryAdmin)?.slug ??
      viewer.primaryNamespaceSlug ??
      resolveInitialAdminNamespaceSlug(c.env);
    return renderUiDocumentResponse(
      c.env,
      "system-admin-users",
      {
        primaryNamespaceSlug: primaryAdminNamespaceSlug,
        primaryPasswordManagedByEnv: authSource !== "d1",
        users,
        counts: {
          users: users.length,
          repositories: repoRows.length,
          activeTokens: patEntries.filter((entry) => !entry.pat.revokedAt).length,
        },
      },
      {
        failureBody: "Failed to render users management page\n",
        viewer,
        branding,
        origin,
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
    const [users, repoRows, patEntries, branding] = await Promise.all([
      loadDirectoryUsers(c),
      listAllRepositoriesWithNamespaces(c.var.db),
      listAllPatsWithOwners(c.var.db),
      loadSiteBranding(c.env),
    ]);
    const authConfig = resolveAdminAuthConfig(c.env);
    const authSource = resolveAdminAuthSource(c.env);
    const primaryAdminNamespaceSlug =
      users.find((u) => u.isPrimaryAdmin)?.slug ??
      viewer.primaryNamespaceSlug ??
      resolveInitialAdminNamespaceSlug(c.env);
    const primaryAdminHandle =
      authSource === "d1" ? primaryAdminNamespaceSlug : authConfig.username;
    const origin = resolveRequestOrigin(c);

    return renderUiDocumentResponse(
      c.env,
      "system-admin-settings",
      {
        authMode: authConfig.mode,
        authSource,
        primaryAdminHandle,
        primaryAdminNamespaceSlug,
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.status === "active").length,
        totalRepositories: repoRows.length,
        publicRepositories: repoRows.filter((r) => r.visibility === "public").length,
        privateRepositories: repoRows.filter((r) => r.visibility === "private").length,
        activeTokens: patEntries.filter((entry) => !entry.pat.revokedAt).length,
        origin,
        branding,
      },
      {
        failureBody: "Failed to render admin settings control panel\n",
        viewer,
        branding,
        origin,
      }
    );
  });

  router.get(`/admin/security`, async (c) => {
    const viewer = await loadViewer(c);
    if (!viewer) {
      return safeRedirect(c, "/auth?next=%2Fadmin%2Fsecurity");
    }
    if (!canAccessAdminPanel(viewer.role)) {
      return safeRedirect(c, "/", 303);
    }
    const [users, repoRows, patEntries, branding] = await Promise.all([
      loadDirectoryUsers(c),
      listAllRepositoriesWithNamespaces(c.var.db),
      listAllPatsWithOwners(c.var.db),
      loadSiteBranding(c.env),
    ]);
    const authConfig = resolveAdminAuthConfig(c.env);
    const authSource = resolveAdminAuthSource(c.env);
    const primaryAdminNamespaceSlug =
      users.find((u) => u.isPrimaryAdmin)?.slug ??
      viewer.primaryNamespaceSlug ??
      resolveInitialAdminNamespaceSlug(c.env);
    const primaryAdminHandle =
      authSource === "d1" ? primaryAdminNamespaceSlug : authConfig.username;
    const origin = resolveRequestOrigin(c);
    return renderUiDocumentResponse(
      c.env,
      "system-admin-security",
      {
        authMode: authConfig.mode,
        authSource,
        primaryAdminHandle,
        primaryAdminNamespaceSlug,
        totalUsers: users.length,
        disabledUsers: users.filter((u) => u.status === "disabled").length,
        usersWithPasswords: users.filter(
          (u) => u.hasPassword || (u.isPrimaryAdmin && authSource !== "d1")
        ).length,
        counts: {
          users: users.length,
          repositories: repoRows.length,
          activeTokens: patEntries.filter((entry) => !entry.pat.revokedAt).length,
        },
      },
      {
        failureBody: "Failed to render admin security page\n",
        viewer,
        branding,
        origin,
      }
    );
  });

  router.get(`/admin/SettingsControlPanel`, (c) => safeRedirect(c, "/admin/settings", 302));

  router.put(`/admin/api/settings`, async (c) => {
    const log = c.var.logFor({ service: "SystemAdmin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("system-admin:settings-same-origin-violation");
      return violation;
    }
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;

    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsed = AdminSettingsUpdateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, reason: "invalid-payload" } as const, 400);
    }

    const branding = await saveSiteBranding(c.env, parsed.data);
    log.info("system-admin:settings-updated", {
      actor: auth.viewer.userId,
      siteName: branding.siteName,
      shortName: branding.shortName,
    });
    return json({ ok: true, branding } as const);
  });

  function brandingFieldForSlot(
    slot: SiteBrandingAssetSlot
  ): "logoUrl" | "faviconUrl" | "ogImageUrl" {
    if (slot === "logo") return "logoUrl";
    if (slot === "favicon") return "faviconUrl";
    return "ogImageUrl";
  }

  router.post(`/admin/api/settings/asset/:slot`, async (c) => {
    const log = c.var.logFor({ service: "SystemAdmin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("system-admin:settings-asset-same-origin-violation");
      return violation;
    }
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;

    const rawSlot = c.req.param("slot");
    if (!isSiteBrandingAssetSlot(rawSlot)) {
      return json({ ok: false, reason: "invalid-slot" } as const, 400);
    }

    const contentLengthHeader = c.req.header("content-length");
    if (contentLengthHeader) {
      const declaredBytes = Number(contentLengthHeader);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BRANDING_ASSET_BYTES[rawSlot]) {
        return json({ ok: false, reason: "too-large" } as const, 413);
      }
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const validation = validateBrandingAssetBytes(rawSlot, bytes);
    if (!validation.ok) {
      const status = validation.reason === "too-large" ? 413 : 400;
      return json({ ok: false, reason: validation.reason } as const, status);
    }

    try {
      await putSiteBrandingAsset(c.env, c.var.limiter, rawSlot, bytes, validation.contentType);
      const url = siteBrandingAssetUrl(rawSlot, Date.now());
      const field = brandingFieldForSlot(rawSlot);
      const branding = await saveSiteBranding(c.env, { [field]: url });
      log.info("system-admin:settings-asset-uploaded", {
        actor: auth.viewer.userId,
        slot: rawSlot,
        bytes: bytes.byteLength,
        contentType: validation.contentType,
      });
      return json({ ok: true, slot: rawSlot, url, branding } as const);
    } catch (error) {
      log.warn("system-admin:settings-asset-upload-failed", {
        slot: rawSlot,
        error: String(error),
      });
      return json({ ok: false, error: "Failed to upload brand asset" } as const, 500);
    }
  });

  router.delete(`/admin/api/settings/asset/:slot`, async (c) => {
    const log = c.var.logFor({ service: "SystemAdmin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("system-admin:settings-asset-delete-same-origin-violation");
      return violation;
    }
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;

    const rawSlot = c.req.param("slot");
    if (!isSiteBrandingAssetSlot(rawSlot)) {
      return json({ ok: false, reason: "invalid-slot" } as const, 400);
    }

    try {
      await deleteSiteBrandingAsset(c.env, c.var.limiter, rawSlot);
      const field = brandingFieldForSlot(rawSlot);
      const branding = await saveSiteBranding(c.env, { [field]: "" });
      log.info("system-admin:settings-asset-deleted", {
        actor: auth.viewer.userId,
        slot: rawSlot,
      });
      return json({ ok: true, slot: rawSlot, branding } as const);
    } catch (error) {
      log.warn("system-admin:settings-asset-delete-failed", {
        slot: rawSlot,
        error: String(error),
      });
      return json({ ok: false, error: "Failed to delete brand asset" } as const, 500);
    }
  });

  router.get(`/api/site-assets/:slot`, async (c) => {
    const rawSlot = c.req.param("slot");
    if (!isSiteBrandingAssetSlot(rawSlot)) {
      return new Response("Not found\n", { status: 404 });
    }
    const obj = await getSiteBrandingAsset(c.env, c.var.limiter, rawSlot);
    if (!obj) {
      return new Response("Not found\n", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const contentType = obj.httpMetadata?.contentType || "application/octet-stream";
    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  router.get(`/favicon.ico`, async (c) => {
    const branding = await loadSiteBranding(c.env);
    if (branding.faviconUrl.startsWith("/api/site-assets/favicon")) {
      const obj = await getSiteBrandingAsset(c.env, c.var.limiter, "favicon");
      if (obj) {
        return new Response(obj.body, {
          status: 200,
          headers: {
            "Content-Type": obj.httpMetadata?.contentType || "image/x-icon",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    if (branding.faviconUrl.startsWith("https://") || branding.faviconUrl.startsWith("http://")) {
      return c.redirect(branding.faviconUrl, 302);
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  });

  router.get(`/robots.txt`, async (c) => {
    const branding = await loadSiteBranding(c.env);
    const body = branding.allowIndexing
      ? "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /auth/\n"
      : "User-agent: *\nDisallow: /\n";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  });

  router.delete(`/admin/api/tokens/:patId`, async (c) => {
    const log = c.var.logFor({ service: "SystemAdmin" });
    const violation = sameOriginViolation(c);
    if (violation) {
      log.warn("system-admin:token-revoke-same-origin-violation");
      return violation;
    }
    const auth = await requireAdminApiViewer(c);
    if (!auth.ok) return auth.response;

    const patId = c.req.param("patId");
    const result = await revokePatAsAdmin(c.var.db, patId, Date.now());
    if (result.ok) {
      log.info("system-admin:token-revoked", { actor: auth.viewer.userId, patId });
      return json({ ok: true, id: patId } as const);
    }
    if (result.reason === "not-found") {
      log.warn("system-admin:token-revoke-not-found", { actor: auth.viewer.userId, patId });
      return json({ ok: false, error: "Not found" } as const, 404);
    }
    log.debug("system-admin:token-already-revoked", { actor: auth.viewer.userId, patId });
    return json({ ok: true, id: patId } as const);
  });

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

  router.patch(`/admin/api/repositories/:repositoryId`, (c) =>
    handleRepositoryPatch(c, c.req.param("repositoryId"), { requireAdmin: true })
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
    if (!canAccessAdminPanel(viewer.role) && !isMember) {
      log.warn("system-admin:repo-delete-forbidden", {
        actor: viewer.userId,
        repositoryId,
      });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }

    const namespace = await findNamespaceById(db, repo.namespaceId);
    if (!namespace) {
      return json({ ok: false, reason: "not-found" } as const, 404);
    }
    const expectedConfirm = `${namespace.slug}/${repo.slug}`;
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

    // Queue consumer owns D1 delete + ROUTES KV + R2 objects + DO storage cleanup
    // when REPO_TASKS_QUEUE is bound; minimal Free deployments without Queues
    // run the same cleanup inline.
    const message: RepositoryDeleteMessage = {
      kind: "repository-delete",
      repositoryId,
      namespaceId: repo.namespaceId,
      namespaceSlug: namespace.slug,
      repoSlug: repo.slug,
      doName: repo.doName,
      actor: viewer.userId,
      requestedAt: Date.now(),
    };
    let queued = true;
    try {
      const dispatched = await dispatchRepositoryDelete({
        env: c.env,
        ctx: workerExecutionContext(c),
        message,
        log,
      });
      queued = dispatched.queued;
    } catch (error) {
      log.error("system-admin:repo-delete-dispatch-failed", {
        actor: viewer.userId,
        repositoryId,
        error: String(error),
      });
      return json({ ok: false, error: "Failed to delete repository; please retry" } as const, 503);
    }

    log.info(queued ? "system-admin:repo-delete-enqueued" : "system-admin:repo-delete-completed", {
      actor: viewer.userId,
      repositoryId,
      namespaceSlug: namespace.slug,
      slug: repo.slug,
      requestedAt: message.requestedAt,
      queued,
    });

    return json({ ok: true, id: repositoryId, queued } as const, queued ? 202 : 200);
  });
}
