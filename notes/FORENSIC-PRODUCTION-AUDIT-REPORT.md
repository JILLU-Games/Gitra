# FORENSIC PRODUCTION AUDIT REPORT — Live Source-Code Verification (`src/**`, `drizzle/**`, `wrangler.jsonc`)

- **Audit Timestamp**: `2026-11-26`
- **Audit Scope**: Full ground-up forensic source-code audit of `src/worker/**`, `src/client/**`, `src/shared/**`, `drizzle/**`, `wrangler.jsonc`, and `package.json`.
- **Verification Standard**: 100% derived directly from live source files (`src/**`), line numbers, and verbatim code blocks. Zero reliance on legacy markdown or assumptions.
- **Directory Constraint**: Only this forensic audit report resides inside `/notes/`. No implementation plan or source-code mutation has been performed in this step.

---

## Executive Summary & Live Verification Baseline

### 1. Live Build, Typecheck & Test Gate Baseline

| Gate                                           | Command                                                | Live Result                              |
| ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| Full Bundle Build (Client + SSR + Worker)      | `npm run build`                                        | **PASS**                                 |
| Strict Global Typecheck (`test/**` + `src/**`) | `npx tsc --noEmit`                                     | **PASS (`0` errors)**                    |
| Cloudflare Worker & Client Typecheck           | `npm run typecheck`                                    | **PASS (`0` errors)**                    |
| Prettier Formatting Check                      | `npm run format:check`                                 | **PASS**                                 |
| Node Unit Test Suite (`vitest.unit.config.ts`) | `npm run test`                                         | **PASS (`14/14` suites, `74/74` tests)** |
| Standalone Pure Logic Audit Suite              | `npx --yes tsx --test test/phase04-logic.node-test.ts` | **PASS (`5/5` tests)**                   |

### 2. High-Level Audit Verdict

1. **Core Production Architecture Is Real & End-to-End Functional**:
   - **Git Smart HTTP v2 (`git clone`, `git fetch`, `git push`)**: Real streaming pkt-line protocol v2 (`ls-refs`, `fetch`) and streaming `receive-pack` (`stagePackToR2` -> `scanPack` -> `resolveDeltasAndWriteIdx` -> `RepoDurableObject.finalizeReceive` -> `REPO_TASKS_QUEUE`), backed by Cloudflare R2 (`REPO_BUCKET`), Durable Object SQLite (`RepoDurableObject`), and D1 (`AUTH_DB`).
   - **Authentication & RBAC Engine**: Real Argon2id password hashing (`AuthDurableObject` + D1 `user_credentials`), rotating SHA-256 session cookies (`__Host-session` / `session`), CSRF origin/host verification, and D1-backed Personal Access Tokens (`goc_...`) with `namespace`, `repo`, and `global` grants (`pull` / `push`).
   - **Web Commit & Repository Management Engine**: Real in-browser Git object synthesis (`commitRepositoryFile` in `src/worker/git/commitFile.ts`) that writes real zlib-compressed packfiles to R2, indexes `.idx` + `.pi` sidecars, and commits ref updates through the repository Durable Object lease model.
   - **System Admin & Repo Admin Consoles**: Real D1 + KV + R2 + Durable Object administration for users, repositories, tokens, site branding, compaction, pack inspection, and asynchronous queue-driven deletion (`REPO_TASKS_QUEUE`).

2. **Demo Mode vs. Production Mode Isolation**:
   - Demo Mode is controlled solely by `isDemoModeEnabled(env)` (`env.DEMO_MODE?.trim().toLowerCase() === "true"` in `src/worker/auth/demoSeed.ts:127-129`).
   - When `DEMO_MODE` is unset or `"false"` (Production Mode), **zero demo accounts, zero demo tokens, and zero demo repositories are seeded**, the quick-login bar on `/auth` is hidden, and all features execute against real D1/DO/R2/KV bindings.
   - When `DEMO_MODE === "true"`, the seeder uses the exact same production pipelines (`stagePackToR2`, `scanPack`, `resolveDeltasAndWriteIdx`, `stub.finalizeReceive`, D1 DALs) to materialize `@admin`, `@vibtools`, and `@alex-dev`.

3. **Newly Uncovered Production Bugs & Discrepancies (`12` Verified Findings)**:
   - Despite the clean compile and passing baseline tests, our line-by-line forensic audit of cross-module interactions uncovered **12 concrete, 100% source-code-verified bugs and architectural discrepancies** (`2 Critical/High Account & Access bugs`, `3 High RBAC/Engine/Cache bugs`, `5 Medium Privacy/KV/Error/Tree bugs`, and `2 Low-Medium UI/Cache parity bugs`).

---

## Section 1: Verified Working Production & Demo Features (With Code Proofs)

Every subsystem below was audited against the live source tree and confirmed to be genuinely implemented (not mocked or stubbed) in both Production Mode and Demo Mode.

### 1.1 Git Smart HTTP v2 Read & Write Engine (`src/worker/routes/git.ts`, `src/worker/git/receive/pipeline.ts`)

- **Endpoints**:
  - `GET /:owner/:repo(.git)?/info/refs` (`src/worker/routes/git.ts:62-122`)
  - `POST /:owner/:repo(.git)?/git-upload-pack` (`src/worker/routes/git.ts:125-156`)
  - `POST /:owner/:repo(.git)?/git-receive-pack` (`src/worker/routes/git.ts:159-250`)
- **Verified Production Behavior**:
  - `git-upload-pack` authenticates via `authorizeGitRequest(c, { owner, repo, service: "git-upload-pack" })` (`src/worker/routes/git.ts:135`), parses Git Wire Protocol v2 commands (`ls-refs`, `fetch`), and streams packfiles directly from R2 pack snapshots via `handleFetchV2Streaming`.
  - `git-receive-pack` enforces push authentication (`level = "push"` PAT via HTTP Basic Auth), acquires an exclusive receive lease on `RepoDurableObject` (`stub.beginReceive()`), streams incoming pack bytes to R2 (`stagePackToR2`), runs two-pass indexing (`scanPack` + `resolveDeltasAndWriteIdx`), atomically commits refs and catalog state (`stub.finalizeReceive`), touches `repositories.updatedAt` in D1 (`touchRepositoryUpdatedAt`), purges `/_cache/refs`, and enqueues background `compaction` and `pack-ref-backfill` messages on `REPO_TASKS_QUEUE`.

```ts
// src/worker/routes/git.ts:220-241
const response = await receivePack(c.env, c.executionCtx, repoId, c.req.raw, {
  onRefsChanged: async () => {
    await touchRepositoryUpdatedAt(createD1Db(c.env.AUTH_DB), access.route.repositoryId).catch(
      (error) => {
        createLogger(c.env.LOG_LEVEL, {
          service: "GitRoutes",
          repoId,
        }).warn("receive:d1-updated-at-failed", {
          error: String(error),
        });
      }
    );
    const refsCacheKey = buildCacheKeyFrom(c.req.raw, "/_cache/refs", {
      repo: repoId,
    });
    await cacheDeleteJSON(refsCacheKey);
  },
});
```

### 1.2 Web File Commit & `.vibtools` Profile README Commit Engine (`src/worker/git/commitFile.ts`, `src/worker/routes/authRepositories.ts`)

- **Endpoints**:
  - `PUT /auth/api/repositories/:repositoryId/file` (`src/worker/routes/authRepositories.ts:440-532`)
  - `PUT /auth/api/repositories/:repositoryId/profile-readme` (`src/worker/routes/authRepositories.ts:369-435`)
  - `POST /auth/api/repositories` with `initializeReadme: true` or `initializeProfileReadme: true` (`src/worker/routes/authRepositories.ts:268-334`)
- **Verified Production Behavior**:
  - `commitRepositoryFile` (`src/worker/git/commitFile.ts:189-428`) acquires a real DO receive lease (`stub.beginReceive()`), loads existing commit and tree hierarchies via `readCommitInfo` and `readLooseTreeEntries`, builds new Git `blob`, `tree`, and `commit` objects, packs them into a valid Git packfile (`buildPackfileFromObjects`), stages to R2 (`stagePackToR2`), indexes `.idx` and `.pi` (`scanPack` + `resolveDeltasAndWriteIdx`), and commits via `stub.finalizeReceive`.

```ts
// src/worker/git/commitFile.ts:294-334
const packBytes = await buildPackfileFromObjects(objectsToPack);
const packKey = r2PackKey(doPrefix(doId), `pack-web-${lease.lease.token}.pack`);
const packStream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(packBytes);
    controller.close();
  },
});

stagedUpload = await stagePackToR2({
  env: args.env,
  request: args.request,
  packStream,
  packKey,
  bytesConsumed: 0,
  limiter,
  countSubrequest: (op, n = 1) => countSubrequest(cacheCtx, log, op, n),
});
```

### 1.3 Multi-Role Authentication, Password Credentials, Sessions & PATs (`src/worker/routes/authLogin.ts`, `src/worker/routes/authTokens.ts`, `src/worker/auth/gitAuth.ts`)

- **Endpoints**:
  - `POST /auth/api/login`, `POST /auth/api/logout`, `POST /auth/api/change-password`, `PUT /auth/api/profile` (`src/worker/routes/authLogin.ts`)
  - `GET /auth/api/tokens`, `POST /auth/api/tokens`, `DELETE /auth/api/tokens/:id` (`src/worker/routes/authTokens.ts`)
- **Verified Production Behavior**:
  - Supports primary admin login (`AUTH_ADMIN_PASSWORD` verified in `AuthDurableObject` via Argon2id with rate limiting) and directory user login (`verifyDirectoryPassword` in D1 `user_credentials` with Argon2id + DO rate limiting).
  - Enforces role-based read-only restrictions (`role === "viewer"` cannot create repositories, toggle visibility, commit files, or mint `"push"` tokens).
  - Supports 3 PAT scopes (`namespace`, `repo`, and admin-only `global` wildcard `"*"`) enforced consistently in `authorizeGitRequest` (`src/worker/auth/gitAuth.ts:132-160`).

### 1.4 System Admin Panel & Queue-Driven Repository Deletion (`src/worker/routes/systemAdmin.ts`, `src/worker/tasks/repositoryDelete.ts`)

- **Endpoints**:
  - `GET /admin`, `GET /admin/repositories`, `GET /admin/users`, `GET /admin/tokens`, `GET /admin/settings`
  - `POST /admin/api/users`, `PATCH /admin/api/users/:userId`, `DELETE /admin/api/users/:userId`
  - `DELETE /admin/api/repositories/:repositoryId`, `DELETE /admin/api/tokens/:tokenId`, `PUT /admin/api/settings`
- **Verified Production Behavior**:
  - Deleting a repository or user deletes the authoritative D1 row first and enqueues `{ kind: "repository-delete", ... }` on `REPO_TASKS_QUEUE` (`src/worker/tasks/repositoryDelete.ts:52-117`), which purges the DO storage/SQLite and R2 prefix (`do/<doId>/`) with automatic retry on failure.

---

## Section 2: Demo Mode vs. Production Mode Forensic Matrix

### 2.1 How Demo Mode Is Gated in Source Code

In `src/worker/auth/demoSeed.ts:127-129`:

```ts
export function isDemoModeEnabled(env: Env): boolean {
  return env.DEMO_MODE?.trim().toLowerCase() === "true";
}
```

### 2.2 Exact Feature Comparison: Demo Mode vs. Production Mode

| Subsystem / Behavior                                                                                                                                                    | Demo Mode (`DEMO_MODE="true"`)                                                        | Production Mode (`DEMO_MODE` unset / `"false"`)                                | Source Code Proof                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `/auth` Quick Demo Sign-In Bar (`@admin` + `@alex-dev` buttons)                                                                                                         | Rendered with pre-filled credentials (`admin` / `admin123`, `alex-dev` / `member123`) | **Completely omitted** (`demoCredentials` is `undefined`)                      | `src/worker/routes/authLogin.ts:104-121`, `src/client/pages/AuthLoginPage.tsx`    |
| Auto-Seeding of `@vibtools` Showcase Namespace & 6 Demo Repos (`edge-git-core`, `worker-pack-engine`, `ui-islands-kit`, `cf-storage-bench`, `infra-notes`, `.vibtools`) | Seeded once on first visit if missing (`ensurePublicDemoShowcaseSeeded`)              | **Never executed** (`if (!isDemoModeEnabled(args.env)) return;`)               | `src/worker/auth/demoSeed.ts:1039-1085`, `src/worker/routes/ui/overview.ts:38-45` |
| Auto-Seeding of `@alex-dev` Member User & `alex-sandbox` Repo                                                                                                           | Seeded once on `/auth`, `/admin`, or `/alex-dev` visit (`ensureDemoTestUserSeeded`)   | **Never executed**                                                             | `src/worker/auth/demoSeed.ts:1093-1197`                                           |
| Fallback Login Password (`admin123`) When `AUTH_ADMIN_PASSWORD` Secret Is Unset                                                                                         | Allowed (`resolveExpectedPassword` falls back to `"admin123"`)                        | **Disallowed** (`resolveExpectedPassword` returns `null`; login returns `401`) | `src/worker/routes/authLogin.ts:52-58`                                            |
| Seeded Demo PAT (`goc_demo_admin_bootstrap_token_vibtools_2026`)                                                                                                        | Seeded for `@admin` on `@vibtools` during demo login                                  | **Never seeded**; users mint real random `goc_...` PATs                        | `src/worker/auth/demoSeed.ts:951-991`                                             |
| All Core Features (Git HTTP v2, Web Editor, Profile README, Admin Panel, Repo Storage Admin, PATs, Branding)                                                            | 100% Real (uses D1, DO, R2, KV, Queues)                                               | 100% Real (uses D1, DO, R2, KV, Queues)                                        | All routes in `src/worker/routes/**`                                              |

---

## Section 3: Forensic Bug & Discrepancy Registry (100% Source-Code Verified)

Below are all **12 verified bugs and architectural discrepancies** discovered in the current live codebase, ordered by severity and impact, with exact file paths, line numbers, verbatim code proofs, and root-cause analysis.

---

### `BUG-NEW-01` [CRITICAL] — Admin `primaryNamespaceSlug` Alphabetical Hijacking & Cross-User Profile Overwrite When Admin Creates Users

- **Severity**: **Critical** (Broken Identity Resolution + Cross-User Data Corruption)
- **Affected Files**:
  1. `src/worker/routes/systemAdmin.ts:385-392`
  2. `src/worker/auth/session.ts:235-259`
  3. `src/worker/db/d1/dal/namespaces.ts:44-60`
  4. `src/worker/routes/authLogin.ts:457-494`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/routes/systemAdmin.ts:385-392
await addNamespaceMember(c.var.db, {
  namespaceId: created.namespaceId,
  userId: viewer.userId,
  role: "owner",
  now: Date.now(),
});
```

```ts
// 2. src/worker/auth/session.ts:235-245
let primaryNamespaceSlug: string | undefined;
try {
  const namespaces = await listNamespacesForUser(c.var.db, active.user.id);
  primaryNamespaceSlug = namespaces[0]?.slug;
} catch (err) {
  createLogger(c.env.LOG_LEVEL, { service: "session" }).warn("viewer-namespace-lookup-failed", {
    userId: active.user.id,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

```ts
// 3. src/worker/db/d1/dal/namespaces.ts:52-59
const namespaces: Namespace[] = [];
for (const m of memberships) {
  const ns = await findNamespaceById(db, m.namespaceId);
  if (ns) namespaces.push(ns);
}
namespaces.sort((a, b) => a.slug.localeCompare(b.slug));
return namespaces;
```

```ts
// 4. src/worker/routes/authLogin.ts:457-481
export async function handleUpdateProfile(c: AuthContext): Promise<Response> {
  const viewer = c.var.viewer;
  if (!viewer) {
    return jsonError(401, "unauthorized");
  }
  if (!viewer.primaryNamespaceSlug) {
    return Response.json({ ok: false, reason: "namespace-not-found" }, { status: 404 });
  }
  ...
  const ns = await findNamespaceBySlug(c.var.db, viewer.primaryNamespaceSlug);
  if (!ns) {
    return Response.json({ ok: false, reason: "namespace-not-found" }, { status: 404 });
  }
  await upsertNamespaceProfile(c.var.db, {
    namespaceId: ns.id,
    displayName: displayName || viewer.displayName || ns.slug,
    bio,
    location,
    website,
    updatedAt: Date.now(),
  });
```

- **Forensic Root Cause & Impact**:
  1. When an admin (whose personal handle is `@admin` or `@vibtools`, or any promoted admin `@zack`) creates a new directory user in `/admin/users` (`POST /admin/api/users`), `handleCreateDirectoryUser` (`systemAdmin.ts:385-391`) adds `viewer.userId` (the admin) into `namespace_memberships` for the newly created user's namespace.
  2. `loadViewerUncached` (`session.ts:237-238`) determines `viewer.primaryNamespaceSlug` by calling `listNamespacesForUser(c.var.db, active.user.id)` and taking `namespaces[0]?.slug`.
  3. `listNamespacesForUser` (`dal/namespaces.ts:58`) sorts all joined namespaces purely alphabetically by `slug` (`a.slug.localeCompare(b.slug)`), **without prioritizing the namespace owned/created by the user (`ns.createdBy === userId`)**!
  4. **Concrete Reproduction**:
     - If `@admin` creates a user `@aaron` (or if `@vibtools` creates `@alex-dev`), `"aaron"` sorts before `"admin"` (`"aaron".localeCompare("admin") < 0`).
     - Immediately, `viewer.primaryNamespaceSlug` for the signed-in admin switches from `"admin"` to `"aaron"`!
     - The admin's header/sidebar "Public Profile" link points to `/aaron` instead of `/admin`.
     - On `/user/profile`, `ProfileSettingsIsland` loads and edits `@aaron`'s profile instead of `@admin`'s, and `PUT /auth/api/profile` (`authLogin.ts:471-489`) **overwrites `@aaron`'s `displayName`, `bio`, `location`, and `website` in D1**!
     - On `/admin/users` (`AdminUsersIsland`), the `"Primary Admin"` card (`src/client/islands/admin-users/index.tsx:238`) displays `@aaron` as the Primary Admin!

---

### `BUG-NEW-02` [HIGH] — System Admin `"Storage"` Button (`/:owner/:repo/admin`) & Private Repository Links Return `403 Forbidden` / `404 Not Found` for Non-Member Site Admins

- **Severity**: **High** (Broken UI-to-Backend Action & RBAC Mismatch)
- **Affected Files**:
  1. `src/client/islands/system-admin/RepositoriesSection.tsx:439, 545-554`
  2. `src/worker/routes/ui/helpers.ts:238-285, 333-351, 386-401`
  3. `src/worker/db/d1/dal/repositories.ts:98-131`
- **Verbatim Code Proof**:

```tsx
// 1. src/client/islands/system-admin/RepositoriesSection.tsx:545-554
<a
  href={`/${repo.namespaceSlug}/${repo.slug}/admin`}
  title="Open Durable Object & pack storage diagnostics"
  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-canvas px-2 text-[11px] font-medium text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
>
  <Wrench className="h-3 w-3 text-fgMuted" aria-hidden="true" />
  <span>Storage</span>
</a>
```

```ts
// 2. src/worker/routes/ui/helpers.ts:333-351
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
// 3. src/worker/routes/ui/helpers.ts:242-254 (resolveUiRepoAccess)
  if (route.visibility === "private") {
    const membership = await loadSessionMembership(request, env, route.namespaceId);
    if (membership.kind !== "member") {
      return { ok: false, response: notFound() };
    }
```

- **Forensic Root Cause & Impact**:
  1. In the System Admin panel (`/admin` and `/admin/repositories`), `RepositoriesSection.tsx` lists every repository across every namespace in the workspace, rendering direct links to `/${repo.namespaceSlug}/${repo.slug}` and a `"Storage"` button linking to `/${repo.namespaceSlug}/${repo.slug}/admin`.
  2. However, `resolveAdminPageRepoAccess` (`helpers.ts:333-351`), `resolveAdminApiRepoAccess` (`helpers.ts:386-401`), and `resolveUiRepoAccess` (`helpers.ts:238-285`) only check `loadSessionMembership(request, env, route.namespaceId)` (`membership.kind === "member"`), **completely ignoring `canAccessAdminPanel(membership.viewer.role)` (`viewer.role === "admin"`)**!
  3. Any Site Admin who is not explicitly inserted into `namespace_memberships` for a target namespace (for example: `@admin` accessing `@alex-dev/alex-sandbox` seeded via `ensureDemoTestUserSeeded` in `demoSeed.ts:1093`, or any directory user promoted to `role = "admin"` via `/admin/users` inspecting any other user's namespace) gets:
     - **`403 Forbidden`** when clicking `"Storage"` (`/:owner/:repo/admin`) on a public repository in `/admin/repositories`.
     - **`404 Not Found`** when clicking either the repository link (`/:owner/:repo`) or `"Storage"` (`/:owner/:repo/admin`) on a private repository in `/admin/repositories`.
     - Missing `"Admin"` tab (`showActivityBanner: false`, `canViewerManageRepo: false`) on public repository pages (`helpers.ts:274`).
     - Hidden private repositories when visiting a user's `/:owner` profile page (`handleOwnerOverview` in `overview.ts:112-119` passes `viewerUserId: isNamespaceMember ? viewer?.userId : undefined` to `listRepositoriesForNamespace`).

---

### `BUG-NEW-03` [HIGH] — Cross-Namespace Web File Commits & Profile README Commits Reject Site Admins with `403 not-member`

- **Severity**: **High** (Inconsistent RBAC Authorization Between UI & API)
- **Affected Files**:
  1. `src/worker/routes/authRepositories.ts:386-393` (`handleCommitProfileReadme`)
  2. `src/worker/routes/authRepositories.ts:457-464` (`handleCommitRepositoryFile`)
- **Verbatim Code Proof**:

```ts
// src/worker/routes/authRepositories.ts:88-90 (handlePatchRepository — allows Site Admin!)
const isAdmin = canAccessAdminPanel(viewer.role);
if (!isAdmin && !(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
  return Response.json({ ok: false, reason: "not-member" }, { status: 403 });
}
```

```ts
// src/worker/routes/authRepositories.ts:386-393 (handleCommitProfileReadme — blocks Site Admin!)
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
// src/worker/routes/authRepositories.ts:457-464 (handleCommitRepositoryFile — blocks Site Admin!)
if (!(await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId))) {
  return Response.json(
    { ok: false, reason: "not-member", detail: "Not a member of this repository's namespace." },
    { status: 403 }
  );
}
```

- **Forensic Root Cause & Impact**:
  - `POST /auth/api/repositories` (`authRepositories.ts:238`) and `PATCH /auth/api/repositories/:id` (`authRepositories.ts:88`) explicitly allow Site Admins (`canAccessAdminPanel(viewer.role)`) to create and manage repositories in any namespace.
  - Furthermore, on `/:owner` (`src/worker/routes/ui/overview.ts:112-113`), `canManageProfile` is true for Site Admins (`const isAdmin = canAccessAdminPanel(viewer?.role); const canManageProfile = Boolean(viewer && (isAdmin || isNamespaceMember) && !isViewerReadOnly);`), rendering the `"Create .vibtools profile"` and `"Edit .vibtools profile"` controls to Site Admins!
  - Yet when a Site Admin opens the `.vibtools` profile README editor or the blob file editor in a namespace where they lack a row in `namespace_memberships` and clicks `"Save & commit"`, `handleCommitProfileReadme` and `handleCommitRepositoryFile` reject the request with `403 { ok: false, reason: "not-member" }`.

---

### `BUG-NEW-04` [HIGH] — Web File Commits (`commitRepositoryFile`) Ignore `finalized.shouldQueueCompaction` and Never Enqueue `REPO_TASKS_QUEUE` Compaction

- **Severity**: **High** (Backend Storage Engine Queue Omission)
- **Affected Files**:
  1. `src/worker/git/commitFile.ts:327-355`
  2. Compare with `src/worker/git/receive/pipeline.ts:331-364` and `src/worker/do/repo/catalog/receive.ts:141-144, 184-186`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/do/repo/catalog/receive.ts:141-144 & 184-186
  const activeCatalog = listActivePackCatalog(db);
  const shouldQueueCompaction = catalogNeedsCompaction(activeCatalog);
  if (shouldQueueCompaction) {
    await deps.state.storage.put("compactionWantedAt", now);
  }
  ...
  return {
    status: "committed",
    packsetVersion,
    refs: nextRefs,
    activeCatalog,
    supersededPackKeys: [],
    shouldQueueCompaction,
  };
```

```ts
// 2. src/worker/git/receive/pipeline.ts:349-363 (CLI git push queues compaction)
if (finalize.shouldQueueCompaction) {
  args.ctx.waitUntil(
    args.env.REPO_TASKS_QUEUE.send({
      kind: "compaction",
      doId: args.stub.id.toString(),
      repoId: args.repoId,
    }).catch((error) => {
      args.log.warn("receive:compaction-enqueue-failed", {
        error: String(error),
      });
    })
  );
}
```

```ts
// 3. src/worker/git/commitFile.ts:327-354 (Web commit drops shouldQueueCompaction!)
countSubrequest(cacheCtx, log, "do:finalize-receive");
const finalized = await limiter.run("do:finalize-receive", async () => {
  return await stub.finalizeReceive({
    token: lease.lease.token,
    commands: [
      {
        oldOid: parentOid ?? ZERO_OID,
        newOid: commitOid,
        ref: branchRef,
      },
    ],
    stagedPack: {
      packKey,
      packBytes: stagedUpload!.packBytes,
      idxBytes: resolveResult.idxBytes,
      objectCount: resolveResult.objectCount,
    },
  });
});

if (finalized.status !== "committed") {
  await deleteStagedPack(stagedUpload).catch(() => {});
  return {
    ok: false,
    status: 409,
    reason: "conflict",
    detail: `Finalize rejected (${finalized.status}).`,
  };
}
// <-- MISSING: if (finalized.shouldQueueCompaction) { args.ctx.waitUntil(args.env.REPO_TASKS_QUEUE.send(...)) }
```

- **Forensic Root Cause & Impact**:
  - Every web edit (`PUT /auth/api/repositories/:id/file` or `PUT /auth/api/repositories/:id/profile-readme`) creates a new tier-0 packfile (`pack-web-<token>.pack`).
  - Once a repository accumulates enough tier-0 packs to trigger `catalogNeedsCompaction(activeCatalog)` (`receive.ts:142`), `stub.finalizeReceive` sets `compactionWantedAt` in DO storage and returns `shouldQueueCompaction: true`.
  - Unlike CLI `git push` (`pipeline.ts:349-363`), `commitRepositoryFile` (`commitFile.ts:327-354`) **ignores `finalized.shouldQueueCompaction`** and never sends `{ kind: "compaction", doId, repoId }` to `env.REPO_TASKS_QUEUE`.
  - As a result, repositories updated via the web editor accumulate uncompacted tier-0 packs and display a stuck `"Compaction queued"` status until the DO idle/maintenance alarm eventually fires.

---

### `BUG-NEW-05` [HIGH] — Repo Admin `PUT /:owner/:repo/admin/head` & `PUT /:owner/:repo/admin/refs` Never Update `repositories.updatedAt` or Invalidate `repo-branch:<id>` / `/_cache/refs`

- **Severity**: **High** (Stale Default Branch & Refs Cache Coherency Failure)
- **Affected Files**:
  1. `src/worker/routes/admin.ts:113-166`
  2. `src/worker/routes/systemAdmin.ts:121-183`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/routes/admin.ts:113-166
  //Update refs (expects full replacement array: [{ name, oid }])
  router.put("/:owner/:repo/admin/refs", async (request, env: Env) => {
    const access = await resolveAdminApiRepoAccess(request, env);
    if (!access.ok) return access.response;
    const { repoId } = access;
    try {
      const refs = parseAdminRefsUpdate(await readJsonObject(request));
      if (!refs.ok) return jsonError(refs.error, 400);
      const stub = getRepoStub(env, repoId);
      const limiter = createSubrequestLimiter(6);
      await limiter.run("do:set-refs", async () => {
        await stub.setRefs(refs.data);
      });
      return json({ ok: true, count: refs.data.length });
    } catch (e) { ... }
  });

  // Update HEAD
  router.put("/:owner/:repo/admin/head", async (request, env: Env) => {
    const access = await resolveAdminApiRepoAccess(request, env);
    if (!access.ok) return access.response;
    const { repoId } = access;
    try {
      const head = parseAdminHeadUpdate(await readJsonObject(request));
      if (!head.ok) return jsonError(head.error, 400);
      const stub = getRepoStub(env, repoId);
      const limiter = createSubrequestLimiter(6);
      await limiter.run("do:set-head", async () => {
        await stub.setHead(head.data);
      });
      return json({ ok: true, head: head.data });
    } catch (e) { ... }
  });
```

```ts
// 2. src/worker/routes/systemAdmin.ts:121-139
if (env.ROUTES) {
  const raw = await env.ROUTES.get(`${REPO_BRANCH_KV_PREFIX}${row.id}`);
  if (raw) {
    const parsed = JSON.parse(raw) as CachedBranchRecord;
    if (
      parsed &&
      parsed.updatedAt === row.updatedAt &&
      typeof parsed.defaultBranch === "string" &&
      parsed.defaultBranch.length > 0
    ) {
      result.set(row.id, parsed.defaultBranch);
      return;
    }
  }
}
```

- **Forensic Root Cause & Impact**:
  1. When `PUT /:owner/:repo/admin/head` or `PUT /:owner/:repo/admin/refs` mutates a repository's `HEAD` or refs in the Durable Object, it neither calls `touchRepositoryUpdatedAt(createD1Db(env.AUTH_DB), access.route.repositoryId)`, nor deletes `repo-branch:${access.route.repositoryId}` from `env.ROUTES` KV, nor purges `/_cache/refs`.
  2. Because `resolveCachedDefaultBranches` (`systemAdmin.ts:121-139`) caches `{ defaultBranch, updatedAt: row.updatedAt }` in `env.ROUTES` KV under `repo-branch:${row.id}` with **no TTL** and validates freshness solely by `parsed.updatedAt === row.updatedAt`, changing `HEAD` via `PUT /:owner/:repo/admin/head` leaves `row.updatedAt` unchanged in D1.
  3. Consequently:
     - `/admin` and `/admin/repositories` continue returning the **stale default branch indefinitely** from `ROUTES` KV.
     - Repository overview/tree/blob/commits pages continue serving cached responses keyed by the old `v: String(access.route.updatedAt)` cache version and stale `/_cache/refs` for up to 60 seconds.

---

### `BUG-NEW-06` [MEDIUM] — Repository Deletion (`handleRepositoryDeleteMessage`) Leaks `repo-branch:<repositoryId>` Keys in `ROUTES` KV

- **Severity**: **Medium** (Permanent KV Storage Leak on Deletion)
- **Affected Files**:
  1. `src/worker/routes/systemAdmin.ts:64, 171-177`
  2. `src/worker/tasks/repositoryDelete.ts:68-75`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/routes/systemAdmin.ts:64 & 171-177
const REPO_BRANCH_KV_PREFIX = "repo-branch:";
...
      if (env.ROUTES) {
        const record: CachedBranchRecord = {
          defaultBranch: branch,
          updatedAt: row.updatedAt,
        };
        await env.ROUTES.put(`${REPO_BRANCH_KV_PREFIX}${row.id}`, JSON.stringify(record));
      }
```

```ts
// 2. src/worker/tasks/repositoryDelete.ts:68-75
// Step 2: Best-effort KV route cache eviction.
try {
  await limiter.run("kv:delete-route-cache", async () => {
    await deleteRouteCacheRecord(env, body.namespaceSlug, body.repoSlug);
  });
} catch (error) {
  log.warn("repository-delete:route-cache-delete-failed", { error: String(error) });
}
```

- **Forensic Root Cause & Impact**:
  - `resolveCachedDefaultBranches` (`systemAdmin.ts:176`) writes `repo-branch:${row.id}` into `env.ROUTES` KV without an expiration TTL.
  - When a repository is deleted (via `/admin/repositories`, `/:owner/:repo/admin/purge`, or cascading user deletion `/admin/users`), `handleRepositoryDeleteMessage` (`repositoryDelete.ts:68-75`) deletes `repo-route:v1:${namespaceSlug}/${repoSlug}` via `deleteRouteCacheRecord`, but **never deletes `repo-branch:${body.repositoryId}`** from `env.ROUTES` KV. Every deleted repository leaves an orphaned KV entry behind forever.

---

### `BUG-NEW-07` [MEDIUM] — Demo Seeder Writes Private Repository (`infra-notes`) into Public `ROUTES` KV Candidate Cache & Checks User-Wide Repos Instead of Namespace Repos

- **Severity**: **Medium** (Privacy Invariant Violation in `ROUTES` KV + Seeder Guard Bug)
- **Affected Files**:
  1. `src/worker/auth/demoSeed.ts:175-182, 914-919, 1010-1015`
  2. Compare with `src/worker/tasks/routeCacheSync.ts:81-95` and `src/worker/routes/authRepositories.ts:255-263`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/tasks/routeCacheSync.ts:81-86 (The Production Privacy Invariant)
    if (repository.visibility === "private") {
      // Private rows must never expose a public route candidate.
      await limiter.run("kv:delete-route-cache", async () => {
        await deleteRouteCacheRecord(env, body.namespaceSlug, body.repoSlug);
      });
```

```ts
// 2. src/worker/auth/demoSeed.ts:914-919 (Demo Seeder violates the invariant!)
await putRouteCacheRecord(args.env, args.namespaceSlug, args.spec.slug, {
  repositoryId: created.repositoryId,
  namespaceId: args.namespaceId,
  doId: created.doId,
});
```

```ts
// 3. src/worker/auth/demoSeed.ts:1010-1015 (Checks listRepositoriesForUser instead of listRepositoriesInNamespace)
const existing = await listRepositoriesForUser(args.db, args.userId);
if (existing.length > 0) {
  demoRepositoriesSeededInIsolate = true;
  return;
}
```

- **Forensic Root Cause & Impact**:
  1. Across the entire production codebase (`routeCacheSync.ts:81-86`, `authRepositories.ts:102-112, 255-263`), private repositories are strictly excluded from the `ROUTES` KV public route cache (`"Private rows must never expose a public route candidate"`).
  2. However, `seedSingleDemoRepository` (`demoSeed.ts:914-919`) unconditionally writes **all** seeded demo repositories—including the private repository `vibtools/infra-notes` (`demoSeed.ts:175-182`)—into `ROUTES` KV!
  3. Additionally, `ensureDemoRepositoriesSeeded` (`demoSeed.ts:1011`) calls `listRepositoriesForUser(args.db, args.userId)` (which lists repositories across **all** namespaces where `userId` is a member) instead of checking repositories in `args.namespaceId`. Since `ensurePublicDemoShowcaseSeeded` adds `@admin` as an owner of `@vibtools` before `@admin` logs in, `listRepositoriesForUser(db, adminUserId)` already returns the 6 `@vibtools` repositories, causing `ensureDemoRepositoriesSeeded` to short-circuit if called for `@admin`'s own namespace.

---

### `BUG-NEW-08` [MEDIUM] — `handleError`, `badRequest`, and `tree.ts` 404 Bypass `renderUiDocumentResponse`, Drop Signed-In `viewer` & Custom `branding`, and Leak Raw 500 Exception Text

- **Severity**: **Medium** (Signed-In Shell Context Loss + Information Disclosure on 500)
- **Affected Files**:
  1. `src/client/server/error.ts:87-139`
  2. `src/worker/routes/ui/helpers.ts:48-55`
  3. `src/worker/routes/ui/tree.ts:39-54, 104-136, 214-221`
  4. `src/worker/routes/ui/blob.ts:225-240, 252-259`
  5. `src/worker/routes/ui/commits.ts:41-47, 140-146, 281-287, 346-353`
  6. `src/worker/routes/ui/overview.ts:398-404`
- **Verbatim Code Proof**:

```ts
// 1. src/client/server/error.ts:95-120
export async function handleError(
  env: Env,
  err: unknown,
  defaultTitle = "Error",
  extra?: ErrorBoundaryExtra
): Promise<Response> {
  const { status, message } = classifyError(err);
  const title = `${status} — ${defaultTitle}`;
  ...
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

```ts
// 2. src/worker/routes/ui/helpers.ts:48-55
export async function badRequest(
  env: Env,
  title: string,
  message: string,
  extra?: { owner?: string; repo?: string; refEnc?: string }
): Promise<Response> {
  return handleError(env, new HttpError(400, message), title, extra);
}
```

```ts
// 3. src/worker/routes/ui/blob.ts:225-240 & 253-258
  if (!isValidRefInput(ref)) {
    return await badRequest(env, "Bad Request — Invalid ref", "Invalid ref format", {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
    });
  }
...
  } catch (e: unknown) {
    return await handleError(env, e, "Error — Blob", {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
    });
  }
```

- **Forensic Root Cause & Impact**:
  1. **Loss of Custom Site Branding on All Error/400/404 Views**: `handleError` (`src/client/server/error.ts:105-118`) and the 404 tree page (`src/worker/routes/ui/tree.ts:106-118`) call `renderUiView(env, "error", ...)` directly instead of `renderUiDocumentResponse` (which calls `loadSiteBranding(env)` in `src/worker/routes/uiResponse.ts:21`). Thus, any 400/404/500 error page reverts custom site branding back to `DEFAULT_SITE_BRANDING`.
  2. **Loss of Signed-In `viewer` Session on Repo Error Pages**: `badRequest` (`helpers.ts:48-55`) does not even accept `viewer` in `extra`, and none of the `badRequest(...)` or `handleError(...)` call sites in `blob.ts`, `tree.ts`, `commits.ts`, or `overview.ts` pass `viewer: access.viewer` (nor does `tree.ts:117`). When a signed-in user hits an invalid ref, invalid path, or missing tree/commit, the error page renders the top navigation bar and sidebar as **signed-out (anonymous)**!
  3. **Unsanitized 500 Exception Message Disclosure**: Unlike `app.onError` (`src/worker/index.ts:276-279`), which masks 500 messages to `"Internal Server Error"` unless `env.LOG_LEVEL === "debug"`, `classifyError` in `src/client/server/error.ts:36-41` passes raw `err.message` for unknown 500 errors directly into the rendered HTML page.

---

### `BUG-NEW-09` [MEDIUM] — Raw Unsanitized 500 Exception Messages Returned by `GET /:owner/:repo/api/refs` and 5 Endpoints in `src/worker/routes/admin.ts`

- **Severity**: **Medium** (Internal Error Message Disclosure & Missing Structured Logging)
- **Affected Files**:
  1. `src/worker/routes/ui/refsApi.ts:32-40`
  2. `src/worker/routes/admin.ts:69-71, 84-86, 197-199, 214-216, 245-247`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/routes/ui/refsApi.ts:32-40
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
```

```ts
// 2. src/worker/routes/admin.ts:69-71, 84-86, 197-199, 214-216, 245-247
    } catch (e) {
      return jsonError(String(e), 500);
    }
```

- **Forensic Root Cause & Impact**:
  - In `src/worker/routes/admin.ts`, four endpoints (`GET /admin/refs`, `PUT /admin/refs`, `PUT /admin/head`, `GET /admin/debug-state`) were hardened to log structured warnings and return `jsonError("Internal Server Error", 500)`, while **five other endpoints in the exact same file** (`POST /admin/compact` line 70, `DELETE /admin/compact` line 85, `GET /admin/debug-oid/:oid` line 198, `DELETE /admin/pack/:packKey` line 215, and `DELETE /admin/purge` line 246) still do `return jsonError(String(e), 500);` without logging!
  - Similarly, `handleRefsApi` (`src/worker/routes/ui/refsApi.ts:32-40`) returns raw `e.message` on status 500 without logging or `Cache-Control: no-store`.

---

### `BUG-NEW-10` [MEDIUM] — `upsertTreePath` in `commitRepositoryFile` Silently Strips Executable File Mode (`100755`) and Overwrites Existing Non-Directory Blob Segments When Creating Nested Paths

- **Severity**: **Medium** (Git Tree Integrity Bug in Web Commit Engine)
- **Affected Files**:
  1. `src/worker/git/commitFile.ts:127-187`
- **Verbatim Code Proof**:

```ts
// src/worker/git/commitFile.ts:153-179
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

const nextEntries = existingEntries.filter((entry) => entry.name !== segment);
nextEntries.push({
  mode: nextChildMode,
  name: segment,
  oid: nextChildOid,
});
```

- **Forensic Root Cause & Impact**:
  1. **Executable Bit Stripping**: When editing an existing file in the web editor (`isLeaf === true`), `upsertTreePath` unconditionally sets `nextChildMode = "100644"` (line 155). If the existing file had mode `"100755"` (an executable shell script or binary tool), editing it in the web editor silently strips its executable permission bit (`100755` -> `100644`)! And if the leaf path matches an existing directory (`40000`), symlink (`120000`), or gitlink/submodule (`160000`), it silently overwrites that entry with a regular file (`100644`) instead of rejecting the commit.
  2. **File-to-Directory Silent Clobber**: When `isLeaf === false` (e.g., path `"README.md/subfile.txt"` where `"README.md"` already exists as a `100644` file at the root), `existingSubtree` is `undefined` (because `"README.md"` does not have mode `"40000"`), and line 173 (`existingEntries.filter((entry) => entry.name !== segment)`) **silently deletes the existing `"README.md"` file and replaces it with a new directory `"README.md/"`** instead of failing with a path conflict error!

---

### `BUG-NEW-11` [LOW-MEDIUM] — Direct Blob View (`GET /:owner/:repo/blob`) Never Loads `loadUiRepoActivity`, Omitting the Active Receive/Compaction Banner

- **Severity**: **Low-Medium** (UI Route Parity Omission)
- **Affected Files**:
  1. `src/worker/routes/ui/blob.ts:210-252`
  2. Compare with `src/worker/routes/ui/overview.ts:360`, `src/worker/routes/ui/tree.ts:171,204`, `src/worker/routes/ui/commits.ts:118,308`
- **Verbatim Code Proof**:

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

- **Forensic Root Cause & Impact**:
  - `renderBlobDocumentResponse` (`blob.ts:37, 91, 153`) already accepts `progress?: RepoActivityStatus` and forwards it to `BlobPage`.
  - When `renderBlobDocumentResponse` is called from `handleTree` (`tree.ts:171-183`), `progress` is loaded via `loadUiRepoActivity(env, access)` and passed in.
  - However, when a user visits `GET /:owner/:repo/blob?ref=...&path=...` directly (`handleBlob` in `blob.ts:241-251`), `loadUiRepoActivity(env, access)` is never called, so the repository activity banner (`Compaction in progress`, `Receive active`, etc.) never displays on direct blob URLs.

---

### `BUG-NEW-12` [LOW-MEDIUM] — Cache Invalidation Key Mismatch Between `overview.ts` and `commitFile.ts` / `git.ts`

- **Severity**: **Low-Medium** (Orphaned Cache Keys & Stale `repo-branch:<id>` After CLI Push without D1 Wait)
- **Affected Files**:
  1. `src/worker/routes/ui/overview.ts:165-169, 333-355`
  2. `src/worker/git/commitFile.ts:360-420`
  3. `src/worker/routes/git.ts:221-238`
- **Verbatim Code Proof**:

```ts
// 1. src/worker/routes/ui/overview.ts:164-169 (handleOwnerOverview caches by targetOid, NOT ref name!)
const md = await loadCandidateMarkdown({
  request,
  env,
  ctx,
  repoId: `${owner}/${PROFILE_REPO_SLUG}`,
  refOrOid: targetOid,
  cachePath: "/_cache/owner-profile-readme",
  candidates: [PROFILE_README_PATH, "README.md"],
  cacheVersion: String(profileRepo.updatedAt),
});
```

```ts
// 2. src/worker/git/commitFile.ts:379-388 (commitFile deletes by refKey = "main" / "refs/heads/main", NOT targetOid!)
for (const refKey of refVariants) {
  const ownerProfileReadmeKey = buildCacheKeyFrom(args.request, "/_cache/owner-profile-readme", {
    repo: repoId,
    ref: refKey,
    path: candidate,
  });
  await cacheDeleteJSON(ownerProfileReadmeKey);
}
```

- **Forensic Root Cause & Impact**:
  1. `handleOwnerOverview` (`overview.ts:165`) and `handleOverview` (`overview.ts:335, 349`) key `/_cache/owner-profile-readme` and `/_cache/readme` using `ref: targetOid` (the 40-char commit SHA) plus `v: String(updatedAt)`.
  2. Meanwhile, `commitRepositoryFile` (`commitFile.ts:379-419`) attempts to delete `/_cache/owner-profile-readme` and `/_cache/readme` using `ref: "main"` / `ref: "refs/heads/main"` and **without** the `v` query parameter—meaning those `cacheDeleteJSON` calls in `commitFile.ts:379-419` never match the actual Cache API keys created by `overview.ts`!
  3. Additionally, when `commitRepositoryFile` updates a repository (`commitFile.ts:360-420`) or when CLI `git push` updates a repository (`git.ts:221-238`), neither deletes `repo-branch:${repositoryId}` from `env.ROUTES` KV if a new default branch was pushed to a previously empty repository while `updatedAt` resolution races.

---

## Section 4: Summary Table of All 12 Verified Findings

| Bug ID       | Severity       | Subsystem                                        | Exact File(s) & Lines                                                                                             | Summary of Verified Defect                                                                                                                                                                                            |
| ------------ | -------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUG-NEW-01` | **CRITICAL**   | Identity / Session / Profile                     | `systemAdmin.ts:385-391`, `session.ts:235-245`, `namespaces.ts:52-59`, `authLogin.ts:457-494`                     | Creating a user adds Admin to `namespace_memberships`; alphabetical sort in `listNamespacesForUser` hijacks `viewer.primaryNamespaceSlug` and causes `/user/profile` saves to overwrite the other user's profile.     |
| `BUG-NEW-02` | **HIGH**       | System Admin -> Repo Admin & Private Repo Access | `RepositoriesSection.tsx:439,547`, `ui/helpers.ts:238-285,333-351,386-401`, `overview.ts:112-119`                 | Site Admins not in `namespace_memberships` get `403 Forbidden` clicking `"Storage"` (`/:owner/:repo/admin`) on public repos and `404 Not Found` on private repos listed in `/admin/repositories`.                     |
| `BUG-NEW-03` | **HIGH**       | Web Commit & Profile README RBAC                 | `authRepositories.ts:386-393, 457-464`                                                                            | `PUT /auth/api/repositories/:id/file` and `/profile-readme` omit `!canAccessAdminPanel(viewer.role)` and reject Site Admins with `403 not-member`.                                                                    |
| `BUG-NEW-04` | **HIGH**       | Web Commit Engine -> Compaction Queue            | `commitFile.ts:327-354` vs `pipeline.ts:349-363`                                                                  | `commitRepositoryFile` ignores `finalized.shouldQueueCompaction` and never enqueues `{ kind: "compaction" }` on `REPO_TASKS_QUEUE`.                                                                                   |
| `BUG-NEW-05` | **HIGH**       | Repo Admin HEAD/Refs -> D1/KV Cache Coherency    | `routes/admin.ts:113-166`, `systemAdmin.ts:121-139`                                                               | `PUT /:owner/:repo/admin/head` and `/admin/refs` do not touch `repositories.updatedAt`, delete `repo-branch:<id>` in `ROUTES` KV, or purge `/_cache/refs`.                                                            |
| `BUG-NEW-06` | **MEDIUM**     | Queue Repo Deletion -> `ROUTES` KV Leak          | `tasks/repositoryDelete.ts:68-75`, `systemAdmin.ts:64,176`                                                        | Deleting a repository never deletes `repo-branch:${repositoryId}` from `env.ROUTES` KV.                                                                                                                               |
| `BUG-NEW-07` | **MEDIUM**     | Demo Seeder -> Private Repo KV Exposure          | `auth/demoSeed.ts:175,914-919,1011` vs `routeCacheSync.ts:81-86`                                                  | `seedSingleDemoRepository` writes private demo repo `infra-notes` into public `ROUTES` KV cache; `ensureDemoRepositoriesSeeded` checks `listRepositoriesForUser` instead of namespace repos.                          |
| `BUG-NEW-08` | **MEDIUM**     | UI Error Boundary / SSR Shell / 500 Sanitization | `client/server/error.ts:87-139`, `ui/helpers.ts:48-55`, `tree.ts:104-136`, `blob.ts:225-258`, `commits.ts:41-353` | `handleError`, `badRequest`, and `tree.ts` 404 drop custom `branding`, drop signed-in `viewer` on repo error pages, and render raw 500 error strings when `LOG_LEVEL !== "debug"`.                                    |
| `BUG-NEW-09` | **MEDIUM**     | JSON API Error Sanitization & Logging            | `ui/refsApi.ts:32-40`, `routes/admin.ts:70,85,198,215,246`                                                        | `GET /:owner/:repo/api/refs` and 5 endpoints in `routes/admin.ts` return raw `String(e)` in 500 JSON responses without structured logging.                                                                            |
| `BUG-NEW-10` | **MEDIUM**     | Web Commit Tree Manipulation (`upsertTreePath`)  | `git/commitFile.ts:153-179`                                                                                       | Editing an executable file (`100755`) in the web editor strips its executable bit to `100644`; committing a nested path through an existing file name silently clobbers the file into a directory (`40000`).          |
| `BUG-NEW-11` | **LOW-MEDIUM** | Blob UI Route Activity Banner Parity             | `routes/ui/blob.ts:241-251`                                                                                       | Direct `GET /:owner/:repo/blob` omits `loadUiRepoActivity(env, access)`, so `progress` banner never renders on direct blob views.                                                                                     |
| `BUG-NEW-12` | **LOW-MEDIUM** | Cache Invalidation Key Alignment                 | `git/commitFile.ts:360-420`, `routes/git.ts:221-238`, `ui/overview.ts:165,335`                                    | `commitFile.ts` deletes `/_cache/readme` & `/_cache/owner-profile-readme` using branch ref names without `v`, whereas `overview.ts` keys them by `targetOid` + `v`; `repo-branch:<id>` is not deleted on push/commit. |

---

## Section 5: Recommended Phased Remediation Grouping (For Next Step)

To fix all **12 verified bugs** cleanly with zero regressions and strict **Scope Lock** per phase, we recommend dividing the remediation into **4 focused, sequential phases**:

1. **Phase 01 — Identity Ownership & Site Admin Cross-Namespace RBAC (`BUG-NEW-01`, `BUG-NEW-02`, `BUG-NEW-03`)**:
   - Fix `listNamespacesForUser` / primary namespace resolution so a user's owned namespace (`createdBy === userId`) is always prioritized first (`BUG-NEW-01`).
   - Grant Site Admins (`canAccessAdminPanel(viewer.role)`) consistent access across `resolveAdminPageRepoAccess`, `resolveAdminApiRepoAccess`, `resolveUiRepoAccess`, `handleOwnerOverview`, `handleCommitProfileReadme`, and `handleCommitRepositoryFile` (`BUG-NEW-02`, `BUG-NEW-03`).
2. **Phase 02 — Git Web Commit Engine, Tree Integrity & Compaction Queue (`BUG-NEW-04`, `BUG-NEW-10`)**:
   - Enqueue `{ kind: "compaction", doId, repoId }` on `REPO_TASKS_QUEUE` in `commitRepositoryFile` whenever `finalized.shouldQueueCompaction` is true (`BUG-NEW-04`).
   - Preserve existing file mode (`100644` vs `100755`) when updating a leaf blob in `upsertTreePath` and reject path conflicts where an intermediate segment is a non-directory or a leaf path is an existing directory/submodule (`BUG-NEW-10`).
3. **Phase 03 — KV / Cache Coherency & Demo Seeder Privacy Invariants (`BUG-NEW-05`, `BUG-NEW-06`, `BUG-NEW-07`, `BUG-NEW-12`)**:
   - Update `PUT /:owner/:repo/admin/head` and `PUT /:owner/:repo/admin/refs` to touch `repositories.updatedAt`, evict `repo-branch:<id>`, and purge `/_cache/refs` (`BUG-NEW-05`).
   - Evict `repo-branch:<repositoryId>` in `handleRepositoryDeleteMessage` (`BUG-NEW-06`) and on ref/HEAD changes (`BUG-NEW-12`).
   - Fix `seedSingleDemoRepository` so private demo repositories are never written to public `ROUTES` KV and scope `ensureDemoRepositoriesSeeded` to `listRepositoriesInNamespace` (`BUG-NEW-07`).
4. **Phase 04 — SSR Error Boundary Shell Context, 500 Sanitization & Blob Activity Parity (`BUG-NEW-08`, `BUG-NEW-09`, `BUG-NEW-11`)**:
   - Preserve signed-in `viewer` and custom `branding` across `handleError`, `badRequest`, and `tree.ts` 404 responses, and sanitize 500 messages when `LOG_LEVEL !== "debug"` (`BUG-NEW-08`).
   - Sanitize and log 500 errors in `handleRefsApi` and the 5 remaining endpoints in `routes/admin.ts` (`BUG-NEW-09`).
   - Load and pass `progress` (`loadUiRepoActivity`) in `handleBlob` (`BUG-NEW-11`).
