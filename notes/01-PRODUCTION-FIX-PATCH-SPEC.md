# 01 — Production Fix Patch Spec & Per-Phase Scope Locks (Req 001)

**Rule:** Every bug below cites verbatim code directly observed in the frozen baseline (`2026-11-26`), the exact `file:line`, the exact target patch design, and the strict **Phase Scope Lock** (allowed files vs. strictly frozen modules). No phase may be implemented outside its Scope Lock.

---

## Phase 01 — Critical Security, RBAC, XSS & Consistency Cookies

### Scope Lock — Phase 01

- **Allowed Write Files (`src/`):**
  - `src/worker/routes/ui/helpers.ts`
  - `src/worker/routes/ui/adminPage.ts`
  - `src/worker/auth/pat.ts`
  - `src/worker/auth/session.ts`
  - `src/worker/routes/ui/blob.ts`
  - `src/worker/routes/ui/raw.ts`
  - `src/worker/routes/d1Bookmark.ts`
- **Allowed Test Additions (`test/`):**
  - `test/admin-disclosure.worker.test.ts` (or new `test/rbac-viewer-admin.worker.test.ts`)
  - `test/pat-verify.worker.test.ts`
  - `test/auth-session.worker.test.ts`
  - `test/d1-session.worker.test.ts`
- **Frozen / Untouched in Phase 01:** System Admin D1 schema, `REPO_TASKS_QUEUE`, React islands UI components, caching keys, Git pack indexer, Vite/Vitest config.

---

### `BUG-01` [Critical] — Role Check Bypass on Repo Admin UI & APIs (`viewer` Privilege Escalation)

- **Exact Files:** `src/worker/routes/ui/helpers.ts:310-353, 368-400`; `src/worker/routes/ui/adminPage.ts:53-57`; contrast `src/worker/routes/ui/helpers.ts:282-286`
- **Baseline Code Proof:**

```ts
// src/worker/routes/ui/helpers.ts:282-286
export function canViewerManageRepo(access: Extract<UiRepoAccess, { kind: "ok" }>): boolean {
  return Boolean(
    access.viewer && canWriteRepositories(access.viewer.role) && access.showActivityBanner
  );
}

// src/worker/routes/ui/helpers.ts:343-353 (resolveAdminPageRepoAccess)
  if (membership.kind === "signed-in-non-member") {
    if (route.visibility === "private") {
      return { kind: "response", response: await notFound(c) };
    }
    return { kind: "response", response: adminForbidden() };
  }

  const cacheCtx = c.var.cacheCtx;
  markRequestPrivate(cacheCtx);
  return { kind: "ok", route, cacheCtx, viewer: membership.viewer, limiter: c.var.limiter };
}

// src/worker/routes/ui/helpers.ts:390-400 (resolveAdminApiRepoAccess) — identical missing role check!

// src/worker/routes/ui/adminPage.ts:54-56
      repo,
      visibility: route.visibility,
      canManageRepo: true,
```

- **Target Patch Spec:**
  1. In `resolveAdminPageRepoAccess` (`helpers.ts` right after line `348`), check `if (!canWriteRepositories(membership.viewer.role)) { return { kind: "response", response: adminForbidden() }; }`.
  2. In `resolveAdminApiRepoAccess` (`helpers.ts` right after line `395`), check `if (!canWriteRepositories(membership.viewer.role)) { return { kind: "response", response: adminJsonError("Forbidden", 403) }; }`.
  3. In `src/worker/routes/ui/adminPage.ts:56`, derive `canManageRepo: canWriteRepositories(viewer.role)` instead of `true`.

---

### `BUG-02` [Critical] — Scoped Git PATs Remain Valid After User Is Disabled or Demoted to `viewer`

- **Exact File:** `src/worker/auth/pat.ts:179-190, 227-253`
- **Baseline Code Proof:**

```ts
// src/worker/auth/pat.ts:227-253
// Repo grant takes precedence; namespace grant covers remaining repos.
if (resolvedRepositoryId) {
  const repoGrant = await findPatGrantForRepo(db, pat.id, resolvedRepositoryId);
  if (repoGrant) {
    return {
      ok: true,
      patId: pat.id,
      userId: pat.userId,
      namespaceId: resolvedNamespaceId!,
      repositoryId: resolvedRepositoryId,
      level: repoGrant.level,
      lastUsedAt: pat.lastUsedAt,
    };
  }
}
const namespaceGrant = await findPatGrantForNamespace(db, pat.id, resolvedNamespaceId!);
if (namespaceGrant) {
  return {
    ok: true,
    patId: pat.id,
    userId: pat.userId,
    namespaceId: resolvedNamespaceId!,
    repositoryId: resolvedRepositoryId,
    level: namespaceGrant.level,
    lastUsedAt: pat.lastUsedAt,
  };
}
```

- **Target Patch Spec (`src/worker/auth/pat.ts`):**
  1. Add helper `loadPatOwnerStatusAndRole(env, db, userId)` resolving whether the owner is the primary admin (`active` + `admin`), or loading `findDirectoryAccountByUserId(env.DB, db, userId)` (rejecting `account.status === "disabled"` with `{ ok: false, reason: "token-revoked" }` or `"grant-missing"` consistently, and when `env.DB` is present and account lookup fails/disabled failing closed).
  2. Call that check once after hash verification (`pat.ts:212`) before returning ANY grant (`repoGrant`, `namespaceGrant`, or `globalGrant`).
  3. If `ownerRole === "viewer"` and the matched grant's `level === "push"`, cap/reject write access or downgrade effective `level` to `"pull"` (returning `"grant-missing"` or `"pull"` so `gitAuth.ts` denies `receive-pack` with `403`, matching `BUG-02` audit expectation & `/admin/security` policy). Wait — explicitly capping or rejecting `push` when `viewer` guarantees `receive-pack` is blocked (`authorizeGitHttp` checks `verified.level === "push"` -> returns 403) while still honoring pull or failing cleanly on `repo-grant` checks; even cleaner: return effective `level: canWriteRepositories(ownerRole) ? grant.level : "pull"` AND document clearly!

---

### `BUG-03` [Critical] — Fail-Open D1 Directory Fallback Elevates `disabled` or `viewer` Sessions to `member`

- **Exact File:** `src/worker/auth/session.ts:260-289` (`loadViewerUncached`)
- **Baseline Code Proof:**

```ts
// src/worker/auth/session.ts:261-289
try {
  const account = await findDirectoryAccountByUserId(c.env.DB, c.var.db, active.user.id);
  if (account) {
    if (account.status === "disabled") {
      return null;
    }
    return {
      userId: active.user.id,
      primaryNamespaceSlug: account.slug,
      displayName: account.displayName || undefined,
      role: account.role,
      isPrimaryAdmin: false,
      hasPassword: account.hasPassword,
    };
  }
} catch {
  // Fall back safely when directory metadata is unavailable.
}

return {
  userId: active.user.id,
  primaryNamespaceSlug,
  role: "member",
  isPrimaryAdmin: false,
  hasPassword: false,
};
```

- **Target Patch Spec (`src/worker/auth/session.ts:261-289`):**
  1. Inside `catch (error)`: log `"session:directory-lookup-failed"` and return `null` (fail closed instead of fabricating a `"member"` session).
  2. After `try`, when `account` is `null` (user row exists without directory metadata): return `role: "viewer"` (least privilege) instead of `"member"`, so an incomplete directory record cannot grant repository write or repo-admin access.

---

### `BUG-04` [High] — Stored XSS via Inline `image/svg+xml` on `rawpath` & `Content-Disposition` Header Injection

- **Exact Files:** `src/worker/routes/ui/blob.ts:159-165`; `src/worker/routes/ui/raw.ts:34-38, 63-90`
- **Baseline Code Proof:**

```ts
// src/worker/routes/ui/blob.ts:160
const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"].includes(ext);

// src/worker/routes/ui/raw.ts:34-37
if (download) {
  headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
} else {
  headers.set("Content-Disposition", `inline; filename="${fileName}"`);
}

// src/worker/routes/ui/raw.ts:86-90
headers.set("Content-Type", getContentTypeFromName(name));
if (isPrivate) headers.set("Cache-Control", "no-store");
if (download) headers.set("Content-Disposition", `attachment; filename="${name}"`);
else headers.set("Content-Disposition", `inline; filename="${name}"`);
```

- **Target Patch Spec:**
  1. Add `sanitizeContentDispositionFilename(name: string): string` in `src/worker/routes/ui/raw.ts` replacing `["\\\r\n;]` and ASCII control chars (plus basename extraction) before quoting into `Content-Disposition` in both `handleRaw` and `handleRawPath`.
  2. In `handleRawPath` (`raw.ts:86-92`), always set `headers.set("X-Content-Type-Options", "nosniff")` and `headers.set("Content-Security-Policy", "sandbox")`; furthermore, for active/scriptable XML/HTML/SVG content (`svg`, `html`, `htm`, `xml`, `xhtml` or `mime.includes("svg")` / `mime.includes("html")` / `mime.includes("xml")`), either force `Content-Type: text/plain; charset=utf-8` (matching `handleRaw` when `!download`) or force `attachment` when `download`, and in `blob.ts:160` remove `"svg"` from inline `isImage` `<img>` rawpath rendering (or keep SVG safe inside `sandbox` CSP with `text/plain` raw fallback / sanitized preview). Removing `svg` from raw inline execution + adding `CSP: sandbox` + `nosniff` + `Content-Disposition` escaping eliminates the stored XSS completely.

---

### `BUG-11` [High] — D1 Bookmark Cookie (`__Host-goc-d1-bm`) Missing `secure: true`, `SameSite=None`, `Partitioned`

- **Exact File:** `src/worker/routes/d1Bookmark.ts:28-33` vs `src/worker/auth/cookies.ts:17-23`
- **Baseline Code Proof:**

```ts
// src/worker/routes/d1Bookmark.ts:28-33
const D1_BOOKMARK_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "Lax",
  maxAge: D1_BOOKMARK_COOKIE_MAX_AGE_SECONDS,
  prefix: D1_BOOKMARK_COOKIE_PREFIX,
} as const satisfies CookieOptions;
```

- **Target Patch Spec (`src/worker/routes/d1Bookmark.ts:28-33`):**
  Align options with `SHARED_COOKIE_OPTIONS` (`cookies.ts:17-23`):

```ts
const D1_BOOKMARK_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "None",
  partitioned: true,
  maxAge: D1_BOOKMARK_COOKIE_MAX_AGE_SECONDS,
  prefix: D1_BOOKMARK_COOKIE_PREFIX,
} as const satisfies CookieOptions;
```

---

## Phase 02 — Data Integrity, Atomic Deletions, Admin Parity & D1 Schema

### Scope Lock — Phase 02

- **Allowed Write Files (`src/`, `drizzle/`):**
  - `src/worker/routes/systemAdmin.ts`
  - `src/worker/routes/authRepositories.ts`
  - `src/worker/routes/authTokens.ts`
  - `src/worker/db/d1/dal/adminDirectory.ts`
  - `src/worker/db/d1/dal/tokens.ts`
  - `src/worker/db/d1/dal/workspaceMeta.ts`
  - `src/worker/db/d1/schema/*` and `src/worker/db/d1/bootstrap.ts`
  - `drizzle/d1/*` (generated via Drizzle D1 migration)
  - `src/client/islands/system-admin/TokensSection.tsx`
  - `src/client/islands/system-admin/RepositoriesSection.tsx`
- **Allowed Test Additions (`test/`):**
  - `test/system-admin.worker.test.ts`
  - `test/repository-delete.worker.test.ts`
  - `test/d1-schema.worker.test.ts`
  - `test/pat-management.worker.test.ts`
  - `test/repo-create.worker.test.ts`
- **Frozen / Untouched in Phase 02:** `RepoDurableObject` internals, Git pack indexer/upload/receive, cache keys, native `alert`/`confirm` UI dialogs (deferred to Phase 04).

---

### `BUG-05` [High] — `DELETE /admin/api/repositories/:id` & `DELETE /admin/api/users/:userId` Orphan R2/DO/`ROUTES`

- **Exact Files:** `src/worker/routes/systemAdmin.ts:535, 800-837`; `src/worker/db/d1/dal/adminDirectory.ts:452-494`
- **Baseline Code Proof:**

```ts
// src/worker/routes/systemAdmin.ts:800-807, 826-837
    const isMember = await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId);
    if (!isMember) {
      log.warn("system-admin:repo-delete-forbidden", { actor: viewer.userId, repositoryId });
      return json({ ok: false, reason: "not-member" } as const, 403);
    }
    ...
    const deleted = await deleteRepositoryById(db, repositoryId);
    if (!deleted) { return json({ ok: false, reason: "not-found" } as const, 404); }
    if (namespace) {
      enqueueRouteCacheSync(c, log, { repositoryId, namespaceSlug: namespace.slug, repoSlug: repo.slug });
    }
```

```ts
// src/worker/db/d1/dal/adminDirectory.ts:461
await db.delete(repositories).where(eq(repositories.namespaceId, namespaceId));
```

- **Target Patch Spec:**
  1. In `DELETE /admin/api/repositories/:repositoryId` (`systemAdmin.ts:800-846`): allow `viewer.role === "admin" || isMember`, validate `confirm === expectedConfirm`, remove premature `deleteRepositoryById` + `repository_meta` leak risk, and instead enqueue `{ kind: "repository-delete", repositoryId, namespaceId: repo.namespaceId, namespaceSlug, repoSlug: repo.slug, doName: repo.doName, actor: viewer.userId, requestedAt: Date.now() }` via `c.env.REPO_TASKS_QUEUE.send(message)` (returning `202 { ok: true, id: repositoryId, queued: true }` or `503` on enqueue failure, matching `admin.ts:262-284`).
  2. In `deleteNamespaceEntry` (`adminDirectory.ts:452-494`): list all repositories in `namespaceId` BEFORE deletion and delete `repository_meta` + `namespace_profile_meta` + return deleted repository metadata `{ repositoryId, repoSlug, doName }` to `handleDeleteDirectoryUser` (`systemAdmin.ts:535`) so `systemAdmin.ts` enqueues `repository-delete` (or R2/DO/ROUTES cleanup) for every repo under that deleted namespace. _(Note: update `deleteNamespaceEntry` or delete user only after enqueuing child repo cleanup / updating `repositoryDelete.ts` safely when D1 row is already gone vs queued first.)_

---

### `BUG-06` [High] — Cross-Namespace Admin Repo Create & Token Issuance Blocked (`403`)

- **Exact Files:** `src/client/islands/system-admin/TokensSection.tsx:184-190`; `src/worker/routes/authTokens.ts:219-225`; `src/client/islands/system-admin/RepositoriesSection.tsx:108-145`; `src/worker/routes/authRepositories.ts:237-243`
- **Baseline Code Proof:**

```ts
// src/worker/routes/authTokens.ts:219-225
if (!(await viewerIsNamespaceMember(db, viewer.userId, namespace.id))) {
  log.warn("pat:create-not-member", { userId: viewer.userId, namespaceId: namespace.id });
  return json({ error: "Forbidden" }, 403);
}
// src/worker/routes/authRepositories.ts:237-243
if (!(await viewerIsNamespaceMember(db, viewer.userId, namespace.id))) {
  log.warn("repo-create:not-member", { userId: viewer.userId, namespaceId: namespace.id });
  return json({ ok: false, reason: "not-member" } as const, 403);
}
```

```tsx
// src/client/islands/system-admin/RepositoriesSection.tsx:140-141
  visibility: body.visibility ?? visibility,
  defaultBranch: "main",
```

- **Target Patch Spec:**
  1. Authorize active `viewer.role === "admin"` to create repositories in any existing namespace (`authRepositories.ts:237`) and mint namespace/repo PATs for namespaces displayed in System Admin (`authTokens.ts:219` — strictly restricted to `viewer.role === "admin"`, never `member`/`viewer`), OR expose admin-specific handlers while keeping existing `/auth/api/*` non-admin membership checks strict (`member` cannot touch other namespaces!). Keep `git-acl` / `pat-verify` admin-vs-member behavior explicitly unit/worker-tested.
  2. In `RepositoriesSection.tsx:141`, read `defaultBranch: body.defaultBranch ?? "main"` returned by the server (or initialize cleanly).

---

### `BUG-09` [High] — D1 Schema Split-Brain Between Drizzle Migrations and Ad-Hoc Runtime DDL

- **Exact Files:** `src/worker/db/d1/schema/*`; `drizzle/d1/0000_gray_supernaut.sql`; `src/worker/db/d1/dal/adminDirectory.ts:50,98,126`; `src/worker/db/d1/dal/tokens.ts:101`; `src/worker/db/d1/dal/workspaceMeta.ts:49,58,77`; `src/worker/db/d1/bootstrap.ts:88-117`
- **Baseline Code Proof:** `drizzle/d1/0000_gray_supernaut.sql` defines 7 tables only; `namespace_directory_meta`, `pat_global_grants`, `namespace_profile_meta`, and `repository_meta` are only created at runtime via `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` inside `adminDirectory.ts`, `tokens.ts`, `workspaceMeta.ts`, and `bootstrap.ts` (`bootstrap.ts` also omits `namespace_profile_meta` and `repository_meta`!).
- **Target Patch Spec:**
  1. Add canonical Drizzle schema definitions for `namespace_directory_meta`, `pat_global_grants`, `namespace_profile_meta`, and `repository_meta` under `src/worker/db/d1/schema/` and export them from `src/worker/db/d1/schema/index.ts`.
  2. Generate formal Drizzle D1 migration (`npm run db:generate:d1`) and record matching statements + `d1_migrations` seed entry in `src/worker/db/d1/bootstrap.ts`.
  3. Remove per-request runtime `CREATE TABLE` / `ALTER TABLE` DDL probes from `adminDirectory.ts`, `tokens.ts`, and `workspaceMeta.ts`.

---

## Phase 03 — Git Engine, Edge Cache Invalidation & DO Lifecycle Atomicity

### Scope Lock — Phase 03

- **Allowed Write Files (`src/`):**
  - `src/worker/routes/git.ts`
  - `src/worker/routes/ui/adminPage.ts`
  - `src/worker/routes/ui/refsApi.ts`
  - `src/worker/routes/ui/tree.ts`
  - `src/worker/routes/ui/commits.ts`
  - `src/worker/routes/ui/blob.ts`
  - `src/worker/routes/ui/overview.ts`
  - `src/worker/git/commitFile.ts`
  - `src/worker/git/operations/read/tree.ts`
  - `src/worker/git/pack/indexer/connectivity.ts`
  - `src/worker/do/repo/packOperations.ts`
  - `src/worker/do/repo/repoDO.ts`
  - `src/worker/do/repo/catalog/receive.ts`
  - `src/worker/do/repo/catalog/compaction/lease.ts`
- **Allowed Test Additions (`test/`):**
  - `test/cache-policy.worker.test.ts`
  - `test/readpath-tag-peel.worker.test.ts`
  - `test/receive-connectivity.worker.test.ts`
  - `test/streaming-receive.worker.test.ts`
  - `test/streaming-compaction.worker.test.ts`
- **Frozen / Untouched in Phase 03:** Auth/session/PAT, D1 directory admin endpoints, React UI pages/islands (except `blob.ts` passing accurate `canEditFile`), `.prettierignore`, `tsconfig.json`.

---

### `BUG-07` [High] — Missing Edge Cache Invalidation After CLI `git push` & Unversioned `/_cache/*` Keys

- **Exact Files:** `src/worker/routes/git.ts:125, 210-224`; `src/worker/routes/ui/adminPage.ts:30`; `src/worker/routes/ui/refsApi.ts:14`; `src/worker/routes/ui/tree.ts:66-70`; `src/worker/routes/ui/commits.ts:72-78`; `src/worker/routes/ui/overview.ts:148, 262, 309-313`; `src/worker/git/commitFile.ts:293-325`
- **Baseline Code Proof:**

```ts
// src/worker/routes/git.ts:125, 210-215
const cacheKeyRefs = buildCacheKeyFrom(request, "/_cache/refs", { repo: route.doName }); // omits v!
...
onRepoStateChanged: async ({ changed }) => {
  if (!changed) return;
  await touchRepositoryUpdatedAt(db, route.repositoryId, Date.now()); // no edge cache purge!
}

// src/worker/git/commitFile.ts:296-311
cacheDeleteJSON(buildCacheKeyFrom(input.cacheCtx.req, "/_cache/refs", { repo: input.doName })),
cacheDeleteJSON(buildCacheKeyFrom(input.cacheCtx.req, "/_cache/readme", { repo: input.doName, ref: shortBranch })), // overview.ts keys by targetOid!
cacheDeleteJSON(buildCacheKeyFrom(input.cacheCtx.req, "/_cache/tree", { repo: input.doName, ref: shortBranch, path: "" })),
```

- **Target Patch Spec:**
  Pass `cacheVersion = String(route.updatedAt)` to ALL `loadHeadAndRefsCached`, `/_cache/refs`, `/_cache/tree`, `/_cache/readme`, `/_cache/owner-profile-readme`, and mutable `/_cache/commits` cache keys (`commits.ts:72`, `tree.ts:66`, `overview.ts:309`, `adminPage.ts:30`, `refsApi.ts:14`, `git.ts:125`), and purge matching versioned keys cleanly on `commitRepositoryFile` + CLI push `onRepoStateChanged`.

---

### `BUG-08` [High] — Inline Web Editor on Tag Refs Silently Creates Orphan Branch (`refs/heads/<tag>`)

- **Exact Files:** `src/worker/routes/ui/blob.ts:123-131`; `src/worker/git/commitFile.ts:162-169`
- **Baseline Code Proof:**

```ts
// src/worker/routes/ui/blob.ts:123-131
const isCommitSha = /^[0-9a-f]{40}$/i.test(ref);
const canEditFile = Boolean(
  viewer &&
  canWriteRepositories(viewer.role) &&
  access.showActivityBanner &&
  !isBinary &&
  Boolean(path) &&
  !isCommitSha
);

// src/worker/git/commitFile.ts:162-169
const requestedTarget = input.targetRef || headAndRefs.head.target || "refs/heads/main";
const branchRef = requestedTarget.startsWith("refs/heads/")
  ? requestedTarget
  : `refs/heads/${requestedTarget.replace(/^refs\/[^/]+\//, "")}`;
```

- **Target Patch Spec:**
  1. In `blob.ts:123-131`, verify `ref` is NOT a commit SHA and NOT `refs/tags/*` or matching a known tag (`headAndRefs.refs` branch check), setting `canEditFile = false` on tags/OIDs.
  2. In `commitFile.ts:162-170`, reject explicit `refs/tags/*` or 40-hex commit OID targets with `{ ok: false, reason: "invalid-ref" }` (add to `CommitFileResult` / `400` in `authRepositories.ts`) instead of silently stripping prefixes into `refs/heads/<tag>`.

---

### `BUG-13` [Medium] — Non-Atomic Multi-Step DO Storage Commits & Warm DO State Leaks

- **Exact Files:** `src/worker/do/repo/packOperations.ts:168-183`; `src/worker/do/repo/repoDO.ts:75-85`; `src/worker/do/repo/catalog/receive.ts:116-142`; `src/worker/do/repo/catalog/compaction/lease.ts:205-235`
- **Target Patch Spec:**
  1. Reset `lastAccessMemMs` and re-run Drizzle DO `migrate(...)` (or re-initialize schema safely) after `ctx.storage.deleteAll()` in `RepoDurableObject` / `clearRepositoryStorage`.
  2. Wrap SQLite + KV catalog mutations inside `ctx.storage.transaction(...)` / `transactionSync` in `finalizeReceiveState` and `commitCompactionState` so DO restarts cannot leave split refs/packCatalog state.

---

### `BUG-14` [Medium] — Incomplete Push Connectivity Check & Tag-Peel Edge Case in `readPath`

- **Exact Files:** `src/worker/git/pack/indexer/connectivity.ts:159-185`; `src/worker/git/operations/read/tree.ts:41-46`
- **Baseline Code Proof (`read/tree.ts:41-46`):**

```ts
  } else if (startObj.type === "tag") {
    const t = parseTagTarget(startObj.payload);
    if (!t || !t.targetOid) throw new Error("Unsupported object type");
    const target = t.targetOid;
    const { tree } = await readCommit(env, repoId, target, cacheCtx);
    currentTreeOid = tree;
```

- **Target Patch Spec:**
  1. Replace single-hop `startObj.type === "tag"` handling in `read/tree.ts:41-46` with bounded multi-hop tag unwrapping supporting final targets of type `"commit"`, `"tree"`, and `"blob"`.
  2. Expand `runPackConnectivityCheck` (`connectivity.ts:159-185`) to recursively walk reachable trees/blobs inside newly pushed commits (bounded + memoized within subrequest budget) rather than checking only root `kind.tree`.

---

### `BUG-15` [Medium] — `commitRepositoryFile` Leaks Receive Lease & Orphans Staged R2 Pack on Error

- **Exact File:** `src/worker/git/commitFile.ts:235-291, 335-345`
- **Baseline Code Proof (`commitFile.ts:281-291`):**

```ts
if (finalized.status !== "committed") {
  input.log.warn("web-commit:finalize-non-committed", {
    repositoryId: input.repositoryId,
    status: finalized.status,
  });
  return {
    ok: false,
    reason: "commit-failed",
    detail: `Finalize status: ${finalized.status}`,
  };
}
```

- **Target Patch Spec:**
  Track `packKey` outside `try`, abort lease (`await stub.abortReceive(token)`) whenever `finalized.status !== "committed"`, and best-effort delete `[packKey, packIndexKey(packKey), packRefsKey(packKey)]` via `env.REPO_BUCKET.delete(...)` in BOTH non-committed and `catch` branches (mirroring `receive/pipeline.ts`).

---

## Phase 04 — Iframe UX, Admin/Route Parity, Hardening & Branding

### Scope Lock — Phase 04

- **Allowed Write Files (`src/`):**
  - `src/client/islands/repo-admin/useRepoAdminActions.ts`, `JsonResult.tsx`, `RepoOverviewCard.tsx`
  - `src/client/islands/repositories.tsx`, `tokens.tsx`
  - `src/client/components/Sidebar.tsx`, `header.tsx`, `footer.tsx`
  - `src/shared/admin/panel.ts`
  - `src/client/pages/HomePage.tsx`, `AdminSettingsPage.tsx`, `AdminSecurityPage.tsx`
  - `src/client/islands/home-repos.tsx`
  - `src/worker/routes/systemAdmin.ts`, `authLogin.ts`, `auth/origin.ts`, `ui/tree.ts`, `ui/commits.ts`, `db/d1/dal/adminDirectory.ts`
- **Allowed Config/Test Additions:** `wrangler.jsonc` (instance branding defaults if env-driven), new/updated tests covering UI links, origin checks, rate limiting, and commits JSON errors.
- **Frozen / Untouched in Phase 04:** Git Smart HTTP wire codec, DO compaction/receive leases, D1 schema tables (unless optional `site_settings` table was queued or env vars used — keep clean!).

---

### `BUG-12` [Medium] — 16 Native `window.alert` / `confirm` / `prompt` Dialogs Break Actions in Iframes

- **Exact Files:** `useRepoAdminActions.ts:44,52,57,67,77,84,90,108,113,117,129,134`; `JsonResult.tsx:14`; `RepoOverviewCard.tsx:38`; `repositories.tsx:142`; `tokens.tsx:216`
- **Target Patch Spec:** Replace all 16 native browser dialogs with accessible React inline confirmation dialogs / typed-phrase prompts / status banners (`ErrorBanner` / inline notice), zero `window.alert|confirm|prompt` calls remaining in `src/client/`.

### `BUG-16` [Medium] — Missing Auth Brute-Force Rate Limiting & Permissive `x-forwarded-host` / Proto Fallback

- **Exact Files:** `src/worker/routes/authLogin.ts:227-375`; `src/worker/auth/origin.ts:38-52`
- **Target Patch Spec:** Add bounded failed-login throttling (returning `429 Retry-After` or login error redirect) on `/auth/login` and `/auth/api/change-password`; restrict `isAllowedOrigin` (`origin.ts:46-52`) so `originUrl.protocol === effectiveProto` (drop unconditional `|| originUrl.protocol === "https:"` on plain `http:`) and validate trusted origin allowlist / exact `host`.

### `BUG-17` [Medium] — Broken Sidebar Links (`/admin#tokens`, Legacy `/auth/account`) & Unhighlighted Views

- **Exact Files:** `src/client/components/Sidebar.tsx:24, 94`; `src/shared/admin/panel.ts:537-557`
- **Target Patch Spec:** Point Sidebar account link to `/user/profile` (or `/user/account`), Admin Tokens CTA to `/admin/tokens`, user Tokens CTA to `/user/settings/tokens`, and map `"system-admin-repositories"`, `"system-admin-tokens"`, `"system-admin-settings"`, `"system-admin-security"` in `resolveActiveSidebarItem`.

### `BUG-18` [Medium] — Truncated Default Branches After 24 Repos & `/admin/tokens` Omitting Other Users' PATs

- **Exact File:** `src/worker/routes/systemAdmin.ts:152-186`
- **Target Patch Spec:** Persist/refresh default branch name in metadata (avoiding 24-repo fan-out cliff) and surface all directory PAT metadata (prefix, owner handle, scope, revoked status, safe-no-secret summary) + admin revoke capability on `/admin/tokens`.

### `BUG-19` [Medium] — Hardcoded `"Vib Tools"` / `git.vibtools.io` Branding, Fake Status Link & Read-Only Settings

- **Exact Files:** `header.tsx:41-43,85`, `footer.tsx:5,8,16,23-24`, `HomePage.tsx:53,61,71,93`, `home-repos.tsx:426,710-741,813,827`, `wrangler.jsonc:10-18`, `AdminSettingsPage.tsx:42-190`
- **Target Patch Spec:** Read instance brand/name/docs/support metadata from env/config (preserving default backwards compatibility or clean instance branding), derive HTTPS clone URL from dynamic request `origin` in `home-repos.tsx:813`, fix/remove fake `Status` -> `/explore` footer link, and clarify or wire editable instance settings on `/admin/settings`.

### `BUG-20` [Medium] — Broken `/tree` Binary Fallback & HTML Errors on JSON Commit Endpoints

- **Exact Files:** `src/worker/routes/ui/tree.ts:174-207`; `src/worker/routes/ui/commits.ts:141-251`
- **Target Patch Spec:** Reuse full `handleBlob` checks (`tooLarge`, binary, image/PDF, breadcrumbs, edit eligibility) when `/tree` hits a blob; return `json({ error }, 400|404|500)` inside `handleCommitFragments` and `handleCommitDiff`.

### `BUG-21` [Low] — Misleading `"HMAC-signed"` Cookie Copy on `/admin/security`

- **Exact File:** `src/client/pages/AdminSecurityPage.tsx:204`
- **Target Patch Spec:** Change `"HMAC-signed · HttpOnly ..."` to `"AES-256-GCM encrypted · HttpOnly ..."` matching `session.ts:15-90`.

### `BUG-22` [Low] — Directory Query Nondeterminism, Swallowed Error & Profile Upsert Race

- **Exact Files:** `src/worker/db/d1/dal/adminDirectory.ts:302-306, 410-416`; `src/worker/routes/authLogin.ts:406-420`
- **Target Patch Spec:** Add deterministic `.orderBy(asc(namespaces.createdAt), asc(namespaces.id))` in `findDirectoryAccountByUserId`; log/handle errors in `updateNamespaceHandle`; update `display_name` + `updated_at` cleanly without clobbering concurrent `role`/`status` changes in `PUT /auth/api/profile`.

---

## Phase 05 — Build, TypeScript, Unit/Worker Tests & CI Hygiene

### Scope Lock — Phase 05

- **Allowed Write Files:**
  - `src/worker/registry/index.ts` (delete dead barrel or fix export)
  - `src/worker/git/pack/indexer/resolve/index.ts` (decouple `cloudflare:workers` top-level import so Node unit suites load cleanly)
  - `tsconfig.json`, `vitest.config.ts`, `vitest.unit.config.ts`, `.prettierignore`
  - `test/github-feel.worker.test.ts` (align assertions cleanly with updated/verified `HomePage.tsx` & `BUG-19`)
- **Frozen / Untouched in Phase 05:** Functional business logic from Phases 01–04 (only CI/typecheck/module-boundary/test-hygiene adjustments permitted).

### `BUG-10` [High] — Failing `github-feel.worker.test.ts`, Failing Root `tsc --noEmit`, Crashing Node Unit Tests

- **Baseline Command & File Proof:**
  - `src/worker/registry/index.ts:5` (`export * from "./owner";` — file missing -> `TS2307`)
  - `src/worker/auth/adminAuth.ts:92` (`import.meta.env?.PROD` -> `TS2339`)
  - `src/shared/**/*.test.ts` (`TS2591`, `TS7006`)
  - `src/worker/git/pack/indexer/resolve/index.ts:19` (`import { exports as workerExports } from "cloudflare:workers";` crashes 5 unit tests under Node Vitest)
  - `test/github-feel.worker.test.ts:254` (`expect(anonHomeHtml).toContain("Vib Tools · Official Open-Source &amp; Engineering Forge")` vs `HomePage.tsx:53`)
- **Target Patch Spec:** Remove dead `src/worker/registry/index.ts`, fix `tsconfig.json` `vite/client` + `@types/node` (or split shared unit tests out cleanly), lazy-import/inject `cloudflare:workers` exports in `indexer/resolve/index.ts`, and reconcile `github-feel.worker.test.ts` against canonical homepage branding.

### `BUG-23` [Low] — Prettier Failure (`FMT_EXIT=1`) & Vitest Config Deprecation Warnings

- **Exact Files:** `.prettierignore`, `vitest.config.ts:5,46`, `vitest.unit.config.ts:8`
- **Target Patch Spec:** Add `.aistudio/` and `.playwright-cli/` to `.prettierignore` and modernize `__dirname` -> `import.meta.dirname` + `.ts` extension import in Vitest configs.
