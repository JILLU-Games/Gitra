# 01 — PRODUCTION FIX PATCH SPECIFICATION (Exact File Paths, Line Numbers & Code Block Proofs)

- **Document ID**: `001-PRODUCTION-FIX-PATCH-SPEC`
- **Source Audit**: `/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md`
- **Coverage**: All `12` verified findings (`BUG-NEW-01` through `BUG-NEW-12`), organized under strict **Phase Scope Locks** (`Phase 01` through `Phase 04`).

---

## PHASE 01 SCOPE LOCK: Identity Ownership & Site Admin Cross-Namespace RBAC (`BUG-NEW-01`, `BUG-NEW-02`, `BUG-NEW-03`)

### Phase 01 Strict Scope Lock Boundary

- **Allowed Source Files to Modify**:
  1. `src/worker/db/d1/dal/namespaces.ts`
  2. `src/worker/routes/ui/helpers.ts`
  3. `src/worker/routes/ui/overview.ts`
  4. `src/worker/routes/authRepositories.ts`
- **Allowed Test Files to Add/Update**:
  - `test/phase04-logic.node-test.ts` or targeted unit/worker tests
- **Forbidden Outside Scope**:
  - Any UI design/layout changes, Git pack engine files, Queue task handlers, or Error page components.

---

### Patch Spec `BUG-NEW-01`: Prioritize User-Owned Namespace (`createdBy === userId`) in `listNamespacesForUser`

- **Exact File**: `src/worker/db/d1/dal/namespaces.ts`
- **Exact Lines**: `44-60`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/db/d1/dal/namespaces.ts:44-60
export async function listNamespacesForUser(db: D1Db, userId: string): Promise<Namespace[]> {
  const memberships = await db
    .select()
    .from(namespaceMemberships)
    .where(eq(namespaceMemberships.userId, userId));
  if (memberships.length === 0) {
    return [];
  }
  const namespaces: Namespace[] = [];
  for (const m of memberships) {
    const ns = await findNamespaceById(db, m.namespaceId);
    if (ns) namespaces.push(ns);
  }
  namespaces.sort((a, b) => a.slug.localeCompare(b.slug));
  return namespaces;
}
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/db/d1/dal/namespaces.ts:44-66
export async function listNamespacesForUser(db: D1Db, userId: string): Promise<Namespace[]> {
  const memberships = await db
    .select()
    .from(namespaceMemberships)
    .where(eq(namespaceMemberships.userId, userId));
  if (memberships.length === 0) {
    return [];
  }
  const namespaces: Namespace[] = [];
  for (const m of memberships) {
    const ns = await findNamespaceById(db, m.namespaceId);
    if (ns) namespaces.push(ns);
  }
  // Prioritize the user's own personal namespace (createdBy === userId) first
  // so `namespaces[0]?.slug` always resolves the user's true primary handle
  // even when an admin is added as an owner of alphabetically earlier namespaces.
  namespaces.sort((a, b) => {
    const aOwned = a.createdBy === userId ? 0 : 1;
    const bOwned = b.createdBy === userId ? 0 : 1;
    if (aOwned !== bOwned) return aOwned - bOwned;
    return a.slug.localeCompare(b.slug);
  });
  return namespaces;
}
```

---

### Patch Spec `BUG-NEW-02`: Allow Site Admins (`canAccessAdminPanel(viewer.role)`) Across Repo Admin, Private Repo Views, and Owner Overview

- **Exact File 1**: `src/worker/routes/ui/helpers.ts`
- **Exact Lines**: `238-285`, `333-351`, `386-401`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/routes/ui/helpers.ts:242-279
if (route.visibility === "private") {
  const membership = await loadSessionMembership(request, env, route.namespaceId);
  if (membership.kind !== "member") {
    return { ok: false, response: notFound() };
  }
  const canEditFiles = membership.viewer.role !== "viewer";
  return {
    ok: true,
    owner,
    repo,
    repoId: `${owner}/${repo}`,
    route,
    viewer: membership.viewer,
    showActivityBanner: canEditFiles,
    canViewerManageRepo: canEditFiles,
  };
}

let viewer: ViewerIdentity | null = null;
let showActivityBanner = false;
if (hasSessionCookie(request)) {
  const membership = await loadSessionMembership(request, env, route.namespaceId);
  if (membership.kind === "member") {
    viewer = membership.viewer;
    showActivityBanner = membership.viewer.role !== "viewer";
  } else if (membership.kind === "signed-in-non-member") {
    viewer = membership.viewer;
  }
}
```

```ts
// src/worker/routes/ui/helpers.ts:333-351 (resolveAdminPageRepoAccess)
const membership = await loadSessionMembership(request, env, route.namespaceId);
if (membership.kind === "member") {
  return {
    ok: true,
    owner,
    repo,
    repoId: `${owner}/${repo}`,
    route,
    viewer: membership.viewer,
  };
}
if (route.visibility === "private") {
  return { ok: false, response: notFound() };
}
if (membership.kind === "signed-in-non-member") {
  return { ok: false, response: forbidden("Forbidden") };
}
```

```ts
// src/worker/routes/ui/helpers.ts:386-401 (resolveAdminApiRepoAccess)
const membership = await loadSessionMembership(request, env, route.namespaceId);
if (membership.kind === "member") {
  return {
    ok: true,
    owner,
    repo,
    repoId: `${owner}/${repo}`,
    route,
  };
}
if (route.visibility === "private") {
  return { ok: false, response: notFound() };
}
if (membership.kind === "signed-in-non-member") {
  return { ok: false, response: jsonError("Forbidden", 403) };
}
```

- **Exact Code Patch (AFTER)** in `src/worker/routes/ui/helpers.ts`:

```ts
// Import `canAccessAdminPanel` from "@/shared/admin/panel" at top of src/worker/routes/ui/helpers.ts
import { canAccessAdminPanel } from "@/shared/admin/panel";

// In resolveUiRepoAccess (src/worker/routes/ui/helpers.ts:242-285):
if (route.visibility === "private") {
  const membership = await loadSessionMembership(request, env, route.namespaceId);
  const isSiteAdmin =
    membership.kind === "signed-in-non-member" && canAccessAdminPanel(membership.viewer.role);
  if (membership.kind !== "member" && !isSiteAdmin) {
    return { ok: false, response: notFound() };
  }
  const activeViewer = membership.viewer;
  const canEditFiles = activeViewer.role !== "viewer";
  return {
    ok: true,
    owner,
    repo,
    repoId: `${owner}/${repo}`,
    route,
    viewer: activeViewer,
    showActivityBanner: canEditFiles,
    canViewerManageRepo: canEditFiles,
  };
}

let viewer: ViewerIdentity | null = null;
let showActivityBanner = false;
if (hasSessionCookie(request)) {
  const membership = await loadSessionMembership(request, env, route.namespaceId);
  if (membership.kind === "member") {
    viewer = membership.viewer;
    showActivityBanner = membership.viewer.role !== "viewer";
  } else if (membership.kind === "signed-in-non-member") {
    viewer = membership.viewer;
    showActivityBanner = canAccessAdminPanel(membership.viewer.role);
  }
}
```

```ts
// In resolveAdminPageRepoAccess (src/worker/routes/ui/helpers.ts:333-355):
const membership = await loadSessionMembership(request, env, route.namespaceId);
if (
  membership.kind === "member" ||
  (membership.kind === "signed-in-non-member" && canAccessAdminPanel(membership.viewer.role))
) {
  return {
    ok: true,
    owner,
    repo,
    repoId: `${owner}/${repo}`,
    route,
    viewer: membership.viewer,
  };
}
if (route.visibility === "private") {
  return { ok: false, response: notFound() };
}
if (membership.kind === "signed-in-non-member") {
  return { ok: false, response: forbidden("Forbidden") };
}
```

```ts
// In resolveAdminApiRepoAccess (src/worker/routes/ui/helpers.ts:386-405):
const membership = await loadSessionMembership(request, env, route.namespaceId);
if (
  membership.kind === "member" ||
  (membership.kind === "signed-in-non-member" && canAccessAdminPanel(membership.viewer.role))
) {
  return {
    ok: true,
    owner,
    repo,
    repoId: `${owner}/${repo}`,
    route,
  };
}
if (route.visibility === "private") {
  return { ok: false, response: notFound() };
}
if (membership.kind === "signed-in-non-member") {
  return { ok: false, response: jsonError("Forbidden", 403) };
}
```

- **Exact File 2**: `src/worker/routes/ui/overview.ts`
- **Exact Lines**: `111-125`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/routes/ui/overview.ts:111-123
const isViewerReadOnly = viewer?.role === "viewer";
const isAdmin = canAccessAdminPanel(viewer?.role);
const canManageProfile = Boolean(viewer && (isAdmin || isNamespaceMember) && !isViewerReadOnly);
const canPinRepos = canManageProfile;
const canFeatureHomepage = Boolean(viewer && isAdmin && !isViewerReadOnly);
const rows = await listRepositoriesForNamespace(db, {
  namespaceSlug: owner,
  viewerUserId: isNamespaceMember ? viewer?.userId : undefined,
});
```

- **Exact Code Patch (AFTER)** in `src/worker/routes/ui/overview.ts`:
  - When `isAdmin || isNamespaceMember` is true, list all repositories in the namespace (`listRepositoriesInNamespace(db, namespace.id)`) so Site Admins visiting `/:owner` also see private repositories under that namespace (consistent with `/admin/repositories` and `canManageProfile`).

```ts
// src/worker/routes/ui/overview.ts:111-125
const isViewerReadOnly = viewer?.role === "viewer";
const isAdmin = canAccessAdminPanel(viewer?.role);
const canReadPrivateNamespaceRepos = Boolean(viewer && (isAdmin || isNamespaceMember));
const canManageProfile = Boolean(canReadPrivateNamespaceRepos && !isViewerReadOnly);
const canPinRepos = canManageProfile;
const canFeatureHomepage = Boolean(viewer && isAdmin && !isViewerReadOnly);
const rows = canReadPrivateNamespaceRepos
  ? await listRepositoriesInNamespace(db, namespace.id)
  : await listRepositoriesForNamespace(db, {
      namespaceSlug: owner,
      viewerUserId: undefined,
    });
```

---

### Patch Spec `BUG-NEW-03`: Authorize Site Admins (`canAccessAdminPanel(viewer.role)`) in `handleCommitProfileReadme` and `handleCommitRepositoryFile`

- **Exact File**: `src/worker/routes/authRepositories.ts`
- **Exact Lines**: `385-394`, `456-465`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/routes/authRepositories.ts:386-393 (handleCommitProfileReadme)
if (
  repo.slug !== PROFILE_REPO_SLUG ||
  !(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))
) {
  return Response.json(
    { ok: false, reason: "not-member", detail: "Not authorized for this profile repository." },
    { status: 403 }
  );
}
```

```ts
// src/worker/routes/authRepositories.ts:457-464 (handleCommitRepositoryFile)
if (!(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
  return Response.json(
    { ok: false, reason: "not-member", detail: "Not a member of this repository's namespace." },
    { status: 403 }
  );
}
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/routes/authRepositories.ts:386-395 (handleCommitProfileReadme)
const isAdmin = canAccessAdminPanel(viewer.role);
if (
  repo.slug !== PROFILE_REPO_SLUG ||
  (!isAdmin && !(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId)))
) {
  return Response.json(
    { ok: false, reason: "not-member", detail: "Not authorized for this profile repository." },
    { status: 403 }
  );
}
```

```ts
// src/worker/routes/authRepositories.ts:457-466 (handleCommitRepositoryFile)
const isAdmin = canAccessAdminPanel(viewer.role);
if (!isAdmin && !(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
  return Response.json(
    { ok: false, reason: "not-member", detail: "Not a member of this repository's namespace." },
    { status: 403 }
  );
}
```

---

## PHASE 02 SCOPE LOCK: Web Commit Engine Compaction Queue & Git Tree Mode/Conflict Integrity (`BUG-NEW-04`, `BUG-NEW-10`)

### Phase 02 Strict Scope Lock Boundary

- **Allowed Source Files to Modify**:
  1. `src/worker/git/commitFile.ts`
- **Allowed Test Files to Add/Update**:
  - `test/phase04-logic.node-test.ts` or targeted unit tests
- **Forbidden Outside Scope**:
  - Any UI pages/islands, Auth routes, Admin routes, or Demo seeder files.

---

### Patch Spec `BUG-NEW-04`: Enqueue `REPO_TASKS_QUEUE` Compaction in `commitRepositoryFile` When `finalized.shouldQueueCompaction` Is True

- **Exact File**: `src/worker/git/commitFile.ts`
- **Exact Lines**: `347-357`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/git/commitFile.ts:347-357
if (finalized.status !== "committed") {
  await deleteStagedPack(stagedUpload).catch(() => {});
  return {
    ok: false,
    status: 409,
    reason: "conflict",
    detail: `Finalize rejected (${finalized.status}).`,
  };
}

leaseToken = undefined;
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/git/commitFile.ts:347-370
if (finalized.status !== "committed") {
  await deleteStagedPack(stagedUpload).catch(() => {});
  return {
    ok: false,
    status: 409,
    reason: "conflict",
    detail: `Finalize rejected (${finalized.status}).`,
  };
}

leaseToken = undefined;

if (finalized.shouldQueueCompaction && args.env.REPO_TASKS_QUEUE) {
  const enqueueTask = args.env.REPO_TASKS_QUEUE.send({
    kind: "compaction",
    doId,
    repoId,
  }).catch((error) => {
    log.warn("commit-file:compaction-enqueue-failed", {
      error: String(error),
    });
  });
  if (args.ctx) {
    args.ctx.waitUntil(enqueueTask);
  } else {
    await enqueueTask;
  }
}
```

---

### Patch Spec `BUG-NEW-10`: Preserve Executable File Mode (`100755`) & Reject File/Directory Path Conflicts in `upsertTreePath`

- **Exact File**: `src/worker/git/commitFile.ts`
- **Exact Lines**: `127-187`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/git/commitFile.ts:150-179
const segment = args.segments[args.index]!;
const isLeaf = args.index === args.segments.length - 1;

let nextChildOid: string;
let nextChildMode: string;
if (isLeaf) {
  nextChildOid = args.leafBlobOid;
  nextChildMode = "100644";
} else {
  const existingSubtree = existingEntries.find(
    (entry) => entry.name === segment && entry.mode.startsWith("40000")
  );
  nextChildOid = await upsertTreePath({
    env: args.env,
    repoId: args.repoId,
    cacheCtx: args.cacheCtx,
    treeOid: existingSubtree?.oid,
    segments: args.segments,
    index: args.index + 1,
    leafBlobOid: args.leafBlobOid,
    objectsOut: args.objectsOut,
  });
  nextChildMode = "40000";
}
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/git/commitFile.ts:150-198
const segment = args.segments[args.index]!;
const isLeaf = args.index === args.segments.length - 1;
const existingEntry = existingEntries.find((entry) => entry.name === segment);

let nextChildOid: string;
let nextChildMode: string;
if (isLeaf) {
  if (existingEntry && existingEntry.mode !== "100644" && existingEntry.mode !== "100755") {
    throw new InvalidTreePathConflictError(
      `Cannot overwrite non-regular file entry '${segment}' (mode ${existingEntry.mode}).`
    );
  }
  nextChildOid = args.leafBlobOid;
  nextChildMode = existingEntry?.mode === "100755" ? "100755" : "100644";
} else {
  if (existingEntry && !existingEntry.mode.startsWith("40000")) {
    throw new InvalidTreePathConflictError(
      `Path segment '${segment}' already exists as a non-directory entry (mode ${existingEntry.mode}).`
    );
  }
  nextChildOid = await upsertTreePath({
    env: args.env,
    repoId: args.repoId,
    cacheCtx: args.cacheCtx,
    treeOid: existingEntry?.oid,
    segments: args.segments,
    index: args.index + 1,
    leafBlobOid: args.leafBlobOid,
    objectsOut: args.objectsOut,
  });
  nextChildMode = "40000";
}
```

And in `commitRepositoryFile`'s `catch` or around `upsertTreePath`, if `error instanceof InvalidTreePathConflictError`, abort the receive lease and return `{ ok: false, status: 400, reason: "invalid-path", detail: error.message }`.

---

## PHASE 03 SCOPE LOCK: D1/KV/Cache Coherency & Demo Seeder Privacy Invariants (`BUG-NEW-05`, `BUG-NEW-06`, `BUG-NEW-07`, `BUG-NEW-12`)

### Phase 03 Strict Scope Lock Boundary

- **Allowed Source Files to Modify**:
  1. `src/worker/repositories/routeCache.ts`
  2. `src/worker/routes/admin.ts`
  3. `src/worker/tasks/repositoryDelete.ts`
  4. `src/worker/auth/demoSeed.ts`
  5. `src/worker/git/commitFile.ts`
  6. `src/worker/routes/git.ts`
- **Allowed Test Files to Add/Update**:
  - `test/phase04-logic.node-test.ts` or targeted unit tests
- **Forbidden Outside Scope**:
  - Any UI components/islands, SSR page templates, or Auth login/session handlers.

---

### Patch Spec `BUG-NEW-05` & `BUG-NEW-06` & `BUG-NEW-12`: Centralize `deleteRepoBranchCacheRecord` and Invalidate on `PUT /admin/head`, `PUT /admin/refs`, Repo Delete, CLI Push, and Web Commit

- **Exact File 1**: `src/worker/repositories/routeCache.ts`
- **Add Helper**:

```ts
const REPO_BRANCH_CACHE_PREFIX = "repo-branch:";

export function buildRepoBranchCacheKey(repositoryId: string): string {
  return `${REPO_BRANCH_CACHE_PREFIX}${repositoryId}`;
}

export async function deleteRepoBranchCacheRecord(
  env: Pick<Env, "ROUTES">,
  repositoryId: string
): Promise<void> {
  if (!env.ROUTES) return;
  await env.ROUTES.delete(buildRepoBranchCacheKey(repositoryId));
}
```

- **Exact File 2**: `src/worker/routes/admin.ts` (`PUT /:owner/:repo/admin/refs` and `PUT /:owner/:repo/admin/head`, lines `113-166`)
- **Current Live Code (BEFORE)**:

```ts
// src/worker/routes/admin.ts:123-128
const stub = getRepoStub(env, repoId);
const limiter = createSubrequestLimiter(6);
await limiter.run("do:set-refs", async () => {
  await stub.setRefs(refs.data);
});
return json({ ok: true, count: refs.data.length });
```

```ts
// src/worker/routes/admin.ts:158-163
const stub = getRepoStub(env, repoId);
const limiter = createSubrequestLimiter(6);
await limiter.run("do:set-head", async () => {
  await stub.setHead(head.data);
});
return json({ ok: true, head: head.data });
```

- **Exact Code Patch (AFTER)** in `src/worker/routes/admin.ts`:
  - After `stub.setRefs(refs.data)` and after `stub.setHead(head.data)`:
    1. Touch `repositories.updatedAt` in D1 via `touchRepositoryUpdatedAt(createD1Db(env.AUTH_DB), access.route.repositoryId)`.
    2. Delete `repo-branch:${access.route.repositoryId}` via `deleteRepoBranchCacheRecord(env, access.route.repositoryId)`.
    3. Purge `/_cache/refs` via `cacheDeleteJSON(buildCacheKeyFrom(request, "/_cache/refs", { repo: repoId }))`.

- **Exact File 3**: `src/worker/tasks/repositoryDelete.ts:68-75` (`BUG-NEW-06`)
- **Exact Code Patch (AFTER)**:

```ts
// Step 2: Best-effort KV route cache and cached default-branch eviction.
try {
  await limiter.run("kv:delete-route-cache", async () => {
    await deleteRouteCacheRecord(env, body.namespaceSlug, body.repoSlug);
    await deleteRepoBranchCacheRecord(env, body.repositoryId);
  });
} catch (error) {
  log.warn("repository-delete:route-cache-delete-failed", { error: String(error) });
}
```

- **Exact File 4**: `src/worker/routes/git.ts:221-238` and `src/worker/git/commitFile.ts:360-420` (`BUG-NEW-12`)
  - In `git.ts:221-238` (`onRefsChanged`), also call `await deleteRepoBranchCacheRecord(c.env, access.route.repositoryId).catch(() => {});`.
  - In `commitFile.ts:360-420`:
    1. Capture the previous `updatedAt` timestamp before `touchRepositoryUpdatedAt`, or include `commitOid` and `parentOid` in `refVariants` when purging `/_cache/readme` and `/_cache/owner-profile-readme`.
    2. Call `await deleteRepoBranchCacheRecord(args.env, args.repositoryId).catch(() => {});`.

---

### Patch Spec `BUG-NEW-07`: Enforce Public-Only `ROUTES` KV Invariant & Namespace-Scoped Check in `demoSeed.ts`

- **Exact File**: `src/worker/auth/demoSeed.ts`
- **Exact Lines**: `914-919` and `1010-1015`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/auth/demoSeed.ts:914-919
await putRouteCacheRecord(args.env, args.namespaceSlug, args.spec.slug, {
  repositoryId: created.repositoryId,
  namespaceId: args.namespaceId,
  doId: created.doId,
});
```

```ts
// src/worker/auth/demoSeed.ts:1010-1015
const existing = await listRepositoriesForUser(args.db, args.userId);
if (existing.length > 0) {
  demoRepositoriesSeededInIsolate = true;
  return;
}
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/auth/demoSeed.ts:914-924
if (args.spec.visibility === "public") {
  await putRouteCacheRecord(args.env, args.namespaceSlug, args.spec.slug, {
    repositoryId: created.repositoryId,
    namespaceId: args.namespaceId,
    doId: created.doId,
  });
} else {
  await deleteRouteCacheRecord(args.env, args.namespaceSlug, args.spec.slug);
}
```

```ts
// src/worker/auth/demoSeed.ts:1010-1015
const existing = await listRepositoriesInNamespace(args.db, args.namespaceId);
if (existing.length > 0) {
  demoRepositoriesSeededInIsolate = true;
  return;
}
```

---

## PHASE 04 SCOPE LOCK: SSR Error Boundary Shell Context, 500 Sanitization & Blob Activity Parity (`BUG-NEW-08`, `BUG-NEW-09`, `BUG-NEW-11`)

### Phase 04 Strict Scope Lock Boundary

- **Allowed Source Files to Modify**:
  1. `src/client/server/error.ts`
  2. `src/worker/routes/ui/helpers.ts`
  3. `src/worker/routes/ui/tree.ts`
  4. `src/worker/routes/ui/blob.ts`
  5. `src/worker/routes/ui/commits.ts`
  6. `src/worker/routes/ui/overview.ts`
  7. `src/worker/routes/ui/refsApi.ts`
  8. `src/worker/routes/admin.ts`
- **Allowed Test Files to Add/Update**:
  - `test/phase04-logic.node-test.ts` or targeted unit tests
- **Forbidden Outside Scope**:
  - Any D1 schema/DAL files, Git pack indexer/rewrite files, or Queue consumers.

---

### Patch Spec `BUG-NEW-08`: Load Site Branding, Preserve Signed-In `viewer`, and Sanitize 500 Messages in `handleError`, `badRequest`, and `tree.ts`

- **Exact File 1**: `src/client/server/error.ts:87-139`
- **Current Live Code (BEFORE)**:

```ts
// src/client/server/error.ts:95-120
export async function handleError(
  env: Env,
  err: unknown,
  defaultTitle = "Error",
  extra?: ErrorBoundaryExtra
): Promise<Response> {
  const { status, message } = classifyError(err);
  const title = `${status} — ${defaultTitle}`;
  createLogger(env.LOG_LEVEL, {
    service: "ui-error-boundary",
    repoId: extra?.owner && extra?.repo ? `${extra.owner}/${extra.repo}` : undefined,
  }).warn("ui:handle-error", { status, title, error: message });

  try {
    const html = await renderUiView(
      env,
      "error",
      {
        title,
        status,
        message,
        owner: extra?.owner,
        repo: extra?.repo,
        refEnc: extra?.refEnc,
      },
      { viewer: extra?.viewer ?? null }
    );
```

- **Exact Code Patch (AFTER)** in `src/client/server/error.ts`:
  1. When `status >= 500` and `env.LOG_LEVEL !== "debug"`, sanitize the displayed `publicMessage` to `"Internal Server Error"` (while still logging the full `message` in `ui:handle-error`).
  2. Load `const branding = await loadSiteBranding(env);` and pass `{ viewer: extra?.viewer ?? null, branding }` to `renderUiView`.

- **Exact File 2**: `src/worker/routes/ui/helpers.ts:48-55`
  - Expand `badRequest` `extra` parameter type to `ErrorBoundaryExtra` (`{ owner?: string; repo?: string; refEnc?: string; viewer?: ViewerIdentity | null }`).

- **Exact Files 3–6**: `src/worker/routes/ui/blob.ts`, `src/worker/routes/ui/tree.ts`, `src/worker/routes/ui/commits.ts`, `src/worker/routes/ui/overview.ts`
  - Pass `viewer: access.viewer` to every `badRequest(...)` and `handleError(...)` call inside repository routes.
  - In `src/worker/routes/ui/tree.ts:106-118`, replace direct `renderUiView(env, "error", ...)` with `renderUiDocumentResponse(env, "error", ..., { status: 404, viewer: access.viewer, headers: { "Cache-Control": "no-store" } })`.

---

### Patch Spec `BUG-NEW-09`: Sanitize & Log 500 JSON Errors in `handleRefsApi` and 5 Remaining Endpoints in `src/worker/routes/admin.ts`

- **Exact File 1**: `src/worker/routes/ui/refsApi.ts:32-40`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/routes/ui/refsApi.ts:32-40
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/routes/ui/refsApi.ts:32-45
  } catch (e: unknown) {
    createLogger(env.LOG_LEVEL, { service: "RefsApi", repoId }).warn("refs-api:failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
```

- **Exact File 2**: `src/worker/routes/admin.ts` (lines `69-71`, `84-86`, `197-199`, `214-216`, `245-247`)
  - Replace all 5 remaining `return jsonError(String(e), 500);` blocks with structured `createLogger(env.LOG_LEVEL, { service: "AdminRoutes", repoId }).warn(...)` logging and `return jsonError("Internal Server Error", 500);`.

---

### Patch Spec `BUG-NEW-11`: Load `loadUiRepoActivity` (`progress`) on Direct Blob View (`GET /:owner/:repo/blob`)

- **Exact File**: `src/worker/routes/ui/blob.ts:241-251`
- **Current Live Code (BEFORE)**:

```ts
// src/worker/routes/ui/blob.ts:241-251
  try {
    return await renderBlobDocumentResponse({
      request,
      env,
      ctx,
      access,
      owner,
      repo,
      repoId,
      ref,
      path,
    });
  } catch (e: unknown) {
```

- **Exact Code Patch (AFTER)**:

```ts
// src/worker/routes/ui/blob.ts:241-253
  try {
    const progress = await loadUiRepoActivity(env, access);
    return await renderBlobDocumentResponse({
      request,
      env,
      ctx,
      access,
      owner,
      repo,
      repoId,
      ref,
      path,
      progress,
    });
  } catch (e: unknown) {
```
