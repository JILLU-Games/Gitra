# 02 — PHASED UPDATE ROADMAP (A–Z Step-by-Step Implementation Plan)

- **Document ID**: `002-PHASED-UPDATE-ROADMAP`
- **Total Phases**: `4` Sequential Scope-Locked Phases (`Phase 01` -> `Phase 02` -> `Phase 03` -> `Phase 04`)
- **Total Bugs Resolved**: `12` (`BUG-NEW-01` through `BUG-NEW-12`)

---

## Roadmap Overview

| Phase        | Phase Name                                                                | Locked Bugs                                            | Target Subsystems                                                                                                                                | Current Status        |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| **Phase 01** | Identity Ownership & Site Admin Cross-Namespace RBAC                      | `BUG-NEW-01`, `BUG-NEW-02`, `BUG-NEW-03`               | Primary namespace resolution, System Admin `"Storage"` & private repo access, cross-namespace Web Commit & Profile README RBAC                   | **PENDING (Next Up)** |
| **Phase 02** | Web Commit Compaction Queue & Git Tree Mode/Conflict Integrity            | `BUG-NEW-04`, `BUG-NEW-10`                             | `commitRepositoryFile` compaction queue dispatch, `upsertTreePath` executable bit preservation & file/directory conflict rejection               | **PENDING**           |
| **Phase 03** | D1/KV/Cache Coherency & Demo Seeder Privacy Invariants                    | `BUG-NEW-05`, `BUG-NEW-06`, `BUG-NEW-07`, `BUG-NEW-12` | Repo Admin `HEAD`/`refs` cache invalidation, `repo-branch:<id>` KV deletion on repo delete/push/commit, Demo Seeder private repo KV exclusion    | **PENDING**           |
| **Phase 04** | SSR Error Boundary Shell Context, 500 Sanitization & Blob Activity Parity | `BUG-NEW-08`, `BUG-NEW-09`, `BUG-NEW-11`               | Custom branding & signed-in `viewer` preservation on error pages, 500 message sanitization in HTML & JSON endpoints, direct blob activity banner | **PENDING**           |

---

## Phase 01: Identity Ownership & Site Admin Cross-Namespace RBAC

### 1. Objective

Eliminate the critical primary-namespace hijacking vulnerability when an admin creates users (`BUG-NEW-01`), and unify Site Admin (`role === "admin"`) authorization across Repo Admin diagnostics (`/:owner/:repo/admin`), private repository UI views, owner profiles (`/:owner`), web file commits, and `.vibtools` profile README commits (`BUG-NEW-02`, `BUG-NEW-03`).

### 2. Strict Scope Lock

- **Bugs Locked**: `BUG-NEW-01`, `BUG-NEW-02`, `BUG-NEW-03`
- **Files Allowed to Edit**:
  - `src/worker/db/d1/dal/namespaces.ts`
  - `src/worker/routes/ui/helpers.ts`
  - `src/worker/routes/ui/overview.ts`
  - `src/worker/routes/authRepositories.ts`
  - `test/phase04-logic.node-test.ts` (for regression tests)
- **Zero Impact Outside Scope**: No changes to client React components, CSS, Git pack engine, Queue tasks, or Demo seeder.

### 3. Step-by-Step Implementation Plan

1. Update `listNamespacesForUser` in `src/worker/db/d1/dal/namespaces.ts:44-60` to sort namespaces owned by `userId` (`ns.createdBy === userId`) ahead of non-owned namespaces before alphabetical comparison.
2. Update `resolveUiRepoAccess`, `resolveAdminPageRepoAccess`, and `resolveAdminApiRepoAccess` in `src/worker/routes/ui/helpers.ts` to treat `membership.kind === "signed-in-non-member" && canAccessAdminPanel(membership.viewer.role)` as authorized with full admin management visibility.
3. Update `handleOwnerOverview` in `src/worker/routes/ui/overview.ts:111-125` so Site Admins (`canAccessAdminPanel(viewer?.role)`) also load private repositories in the namespace (`listRepositoriesInNamespace(db, namespace.id)`).
4. Update `handleCommitProfileReadme` and `handleCommitRepositoryFile` in `src/worker/routes/authRepositories.ts:386-393, 457-464` to authorize `canAccessAdminPanel(viewer.role) || viewerIsNamespaceMember(...)`.
5. Add unit/regression tests and run all verification gates.

### 4. Phase 01 Verification Gates

- `npm run typecheck`
- `npx tsc --noEmit`
- `npx --yes tsx --test test/phase04-logic.node-test.ts`
- `npm run test`
- `npm run format:check`

---

## Phase 02: Web Commit Compaction Queue & Git Tree Mode/Conflict Integrity

### 1. Objective

Ensure web file commits enqueue background pack compaction when `finalized.shouldQueueCompaction` is true (`BUG-NEW-04`), and ensure `upsertTreePath` preserves `100755` executable file modes and rejects destructive file-vs-directory path conflicts (`BUG-NEW-10`).

### 2. Strict Scope Lock

- **Bugs Locked**: `BUG-NEW-04`, `BUG-NEW-10`
- **Files Allowed to Edit**:
  - `src/worker/git/commitFile.ts`
  - `test/phase04-logic.node-test.ts` (for regression tests)
- **Zero Impact Outside Scope**: No changes to UI pages, Auth/RBAC routes, Admin routes, or KV caches.

### 3. Step-by-Step Implementation Plan

1. In `src/worker/git/commitFile.ts:127-187`, introduce `InvalidTreePathConflictError` and update `upsertTreePath` to:
   - Preserve `100755` when updating an existing executable file (`existingEntry?.mode === "100755" ? "100755" : "100644"`).
   - Throw `InvalidTreePathConflictError` if `isLeaf === true` and `existingEntry` exists with a non-regular file mode (`40000`, `120000`, `160000`).
   - Throw `InvalidTreePathConflictError` if `isLeaf === false` and `existingEntry` exists with a non-directory mode (`!existingEntry.mode.startsWith("40000")`).
2. Map `InvalidTreePathConflictError` in `commitRepositoryFile` to `{ ok: false, status: 400, reason: "invalid-path", detail: error.message }`.
3. In `src/worker/git/commitFile.ts:347-360`, check `if (finalized.shouldQueueCompaction && args.env.REPO_TASKS_QUEUE)` after `finalized.status === "committed"` and enqueue `{ kind: "compaction", doId, repoId }`.
4. Add unit/regression tests and run all verification gates.

### 4. Phase 02 Verification Gates

- `npm run typecheck`
- `npx tsc --noEmit`
- `npx --yes tsx --test test/phase04-logic.node-test.ts`
- `npm run test`
- `npm run format:check`

---

## Phase 03: D1/KV/Cache Coherency & Demo Seeder Privacy Invariants

### 1. Objective

Ensure Repo Admin `HEAD` and `refs` mutations, repository deletions, CLI pushes, and web commits maintain 100% cache coherency across D1 `repositories.updatedAt`, `ROUTES` KV (`repo-branch:<id>`), and Cache API (`/_cache/*`) (`BUG-NEW-05`, `BUG-NEW-06`, `BUG-NEW-12`), and prevent `demoSeed.ts` from writing private repositories into the public `ROUTES` KV cache (`BUG-NEW-07`).

### 2. Strict Scope Lock

- **Bugs Locked**: `BUG-NEW-05`, `BUG-NEW-06`, `BUG-NEW-07`, `BUG-NEW-12`
- **Files Allowed to Edit**:
  - `src/worker/repositories/routeCache.ts`
  - `src/worker/routes/admin.ts`
  - `src/worker/tasks/repositoryDelete.ts`
  - `src/worker/auth/demoSeed.ts`
  - `src/worker/git/commitFile.ts`
  - `src/worker/routes/git.ts`
  - `test/phase04-logic.node-test.ts` (for regression tests)
- **Zero Impact Outside Scope**: No changes to UI components, SSR error templates, or Git object parsers.

### 3. Step-by-Step Implementation Plan

1. Export `buildRepoBranchCacheKey` and `deleteRepoBranchCacheRecord` from `src/worker/repositories/routeCache.ts`.
2. Update `PUT /:owner/:repo/admin/refs` and `PUT /:owner/:repo/admin/head` in `src/worker/routes/admin.ts:113-166` to touch `repositories.updatedAt`, delete `repo-branch:<repositoryId>`, and delete `/_cache/refs`.
3. Update `handleRepositoryDeleteMessage` in `src/worker/tasks/repositoryDelete.ts:68-75` to call `deleteRepoBranchCacheRecord(env, body.repositoryId)`.
4. Update `handleReceivePackPOST` (`src/worker/routes/git.ts:221-238`) and `commitRepositoryFile` (`src/worker/git/commitFile.ts:360-420`) to delete `repo-branch:<repositoryId>` and align README cache invalidation keys.
5. Update `seedSingleDemoRepository` (`src/worker/auth/demoSeed.ts:914-919`) so only `visibility === "public"` writes to `ROUTES` KV, and update `ensureDemoRepositoriesSeeded` (`src/worker/auth/demoSeed.ts:1011`) to use `listRepositoriesInNamespace(args.db, args.namespaceId)`.

### 4. Phase 03 Verification Gates

- `npm run typecheck`
- `npx tsc --noEmit`
- `npx --yes tsx --test test/phase04-logic.node-test.ts`
- `npm run test`
- `npm run format:check`

---

## Phase 04: SSR Error Boundary Shell Context, 500 Sanitization & Blob Activity Parity

### 1. Objective

Preserve custom site branding and signed-in `viewer` navigation state across all repository 400/404/500 error pages (`BUG-NEW-08`), sanitize and log 500 error responses in `handleError`, `handleRefsApi`, and `routes/admin.ts` (`BUG-NEW-08`, `BUG-NEW-09`), and load the active repository status banner (`loadUiRepoActivity`) on direct `GET /:owner/:repo/blob` requests (`BUG-NEW-11`).

### 2. Strict Scope Lock

- **Bugs Locked**: `BUG-NEW-08`, `BUG-NEW-09`, `BUG-NEW-11`
- **Files Allowed to Edit**:
  - `src/client/server/error.ts`
  - `src/worker/routes/ui/helpers.ts`
  - `src/worker/routes/ui/tree.ts`
  - `src/worker/routes/ui/blob.ts`
  - `src/worker/routes/ui/commits.ts`
  - `src/worker/routes/ui/overview.ts`
  - `src/worker/routes/ui/refsApi.ts`
  - `src/worker/routes/admin.ts`
  - `test/phase04-logic.node-test.ts` (for regression tests)
- **Zero Impact Outside Scope**: No changes to D1 DALs, Git receive/fetch pipelines, or React islands.

### 3. Step-by-Step Implementation Plan

1. Update `handleError` in `src/client/server/error.ts:95-138` to load `loadSiteBranding(env)` and sanitize 500 messages to `"Internal Server Error"` when `env.LOG_LEVEL !== "debug"`.
2. Update `badRequest` in `src/worker/routes/ui/helpers.ts:48-55` to accept `viewer?: ViewerIdentity | null`, and pass `viewer: access.viewer` in `blob.ts`, `tree.ts`, `commits.ts`, and `overview.ts`.
3. Update `tree.ts:106-118` to use `renderUiDocumentResponse` with `viewer: access.viewer` and `status: 404`.
4. Update `handleRefsApi` (`src/worker/routes/ui/refsApi.ts:32-40`) and the 5 remaining catch blocks in `src/worker/routes/admin.ts` (`lines 70, 85, 198, 215, 246`) to log warnings and return sanitized `"Internal Server Error"` with `Cache-Control: no-store`.
5. Update `handleBlob` (`src/worker/routes/ui/blob.ts:241-251`) to call `const progress = await loadUiRepoActivity(env, access)` and pass `progress` to `renderBlobDocumentResponse`.

### 4. Phase 04 & Final Release Verification Gates

- `npm run build`
- `npm run typecheck`
- `npx tsc --noEmit`
- `npx --yes tsx --test test/phase04-logic.node-test.ts`
- `npm run test`
- `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts`
- `npm run format:check`
