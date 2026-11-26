# 03 — PHASE EXECUTION LOG & PROGRESS LEDGER

- **Document ID**: `003-PHASE-EXECUTION-LOG`
- **Baseline Reference**: `/notes/00-BASELINE-FREEZE-AND-INDEX.md` & `/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md`
- **Completed Phases**: `4 / 4` (`100%` — **All 4 Phases Completed & Verified**)
- **Remaining Phases**: `0 / 4` (`None — All 12 Forensic Bugs Resolved`)
- **Current Next Action**: All 4 production remediation phases are complete and verified.

---

## 1. Master Phase Progress Summary

| Phase        | Target Bugs                                            | Scope-Locked Files                                                                                                                                                                                                                                                                                         | Status                   | Unrelated Features/UI Modified? |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------- |
| **Phase 01** | `BUG-NEW-01`, `BUG-NEW-02`, `BUG-NEW-03`               | `src/worker/db/d1/dal/namespaces.ts`, `src/worker/routes/ui/helpers.ts`, `src/worker/routes/ui/overview.ts`, `src/worker/routes/authRepositories.ts`, `test/phase04-logic.node-test.ts`                                                                                                                    | **COMPLETED & VERIFIED** | `No (Strict Scope Lock)`        |
| **Phase 02** | `BUG-NEW-04`, `BUG-NEW-10`                             | `src/worker/git/commitFile.ts`, `test/phase04-logic.node-test.ts`                                                                                                                                                                                                                                          | **COMPLETED & VERIFIED** | `No (Strict Scope Lock)`        |
| **Phase 03** | `BUG-NEW-05`, `BUG-NEW-06`, `BUG-NEW-07`, `BUG-NEW-12` | `src/worker/repositories/routeCache.ts`, `src/worker/routes/admin.ts`, `src/worker/tasks/repositoryDelete.ts`, `src/worker/auth/demoSeed.ts`, `src/worker/git/commitFile.ts`, `src/worker/routes/git.ts`, `test/phase04-logic.node-test.ts`                                                                | **COMPLETED & VERIFIED** | `No (Strict Scope Lock)`        |
| **Phase 04** | `BUG-NEW-08`, `BUG-NEW-09`, `BUG-NEW-11`               | `src/client/server/error.ts`, `src/worker/routes/ui/helpers.ts`, `src/worker/routes/ui/tree.ts`, `src/worker/routes/ui/blob.ts`, `src/worker/routes/ui/commits.ts`, `src/worker/routes/ui/overview.ts`, `src/worker/routes/ui/refsApi.ts`, `src/worker/routes/admin.ts`, `test/phase04-logic.node-test.ts` | **COMPLETED & VERIFIED** | `No (Strict Scope Lock)`        |

---

## 2. Completed Phases Log (`4 / 4` Completed)

### Completed -> Phase 01: Identity Ownership & Site Admin Cross-Namespace RBAC

- **Completion Timestamp**: `2026-11-26`
- **Locked Bugs Resolved**:
  1. `BUG-NEW-01` (**CRITICAL**): Added `sortNamespacesForUser` and updated `listNamespacesForUser` in `src/worker/db/d1/dal/namespaces.ts:51-77` so namespaces owned by the user (`createdBy === userId`) always sort before alphabetically earlier joined namespaces.
  2. `BUG-NEW-02` (**HIGH**): Updated `resolveUiRepoAccess`, `resolveAdminPageRepoAccess`, and `resolveAdminApiRepoAccess` in `src/worker/routes/ui/helpers.ts` and `handleOwnerOverview` in `src/worker/routes/ui/overview.ts` to authorize Site Admins (`canAccessAdminPanel(viewer.role)`).
  3. `BUG-NEW-03` (**HIGH**): Updated `PUT /auth/api/repositories/:repositoryId/profile-readme` (`src/worker/routes/authRepositories.ts:386-396`) and `PUT /auth/api/repositories/:repositoryId/file` (`src/worker/routes/authRepositories.ts:456-466`) to authorize Site Admins (`canAccessAdminPanel(viewer.role)`).
- **Out-of-Scope Modifications**: `None`.

### Completed -> Phase 02: Web Commit Compaction Queue & Git Tree Mode/Conflict Integrity

- **Completion Timestamp**: `2026-11-26`
- **Locked Bugs Resolved**:
  1. `BUG-NEW-04` (**HIGH**): Updated `commitRepositoryFile` in `src/worker/git/commitFile.ts:395-412` so that whenever `finalized.shouldQueueCompaction` is true, `{ kind: "compaction", doId: stub.id.toString(), repoId: input.doName }` is enqueued on `input.env.REPO_TASKS_QUEUE` (matching CLI `git push`).
  2. `BUG-NEW-10` (**MEDIUM**): Added pure `resolveUpsertTreeEntryPlan` and updated `upsertTreePath` in `src/worker/git/commitFile.ts:133-240` to preserve executable file permissions (`100755`) when updating an existing executable file, and to reject file-vs-directory or non-regular entry (`40000`, `120000`, `160000`) path conflicts with `{ ok: false, reason: "invalid-path", detail }` before acquiring a DO receive lease.
- **Out-of-Scope Modifications**: `None`.

### Completed -> Phase 03: D1/KV/Cache Coherency & Demo Seeder Privacy Invariants

- **Completion Timestamp**: `2026-11-26`
- **Locked Bugs Resolved**:
  1. `BUG-NEW-05` (**HIGH**): Added `repoBranchCacheKey` and `deleteRepoBranchCacheRecord` to `src/worker/repositories/routeCache.ts` and `invalidateRepoRefsAndBranchCache` to `src/worker/routes/admin.ts` so `PUT /:owner/:repo/admin/refs` and `PUT /:owner/:repo/admin/head` bump `repositories.updatedAt` in D1, delete `repo-branch:<repositoryId>` from `ROUTES` KV, and purge `/_cache/refs`.
  2. `BUG-NEW-06` (**MEDIUM**): Updated Step 2 of `handleRepositoryDeleteMessage` in `src/worker/tasks/repositoryDelete.ts` to call `deleteRepoBranchCacheRecord(env, body.repositoryId)` alongside `deleteRouteCacheRecord`.
  3. `BUG-NEW-07` (**MEDIUM**): Updated `seedSingleDemoRepository` in `src/worker/auth/demoSeed.ts` so only `public` demo repositories write to `ROUTES` KV (private `infra-notes` clears any stale entry), and updated `ensureDemoRepositoriesSeeded` & `ensureDemoTestUserSeeded` to check `listRepositoriesInNamespace(args.db, ...)`.
  4. `BUG-NEW-12` (**LOW**): Updated `handleReceivePackPOST` (`src/worker/routes/git.ts`) and `commitRepositoryFile` (`src/worker/git/commitFile.ts`) to delete `repo-branch:<repositoryId>` from `ROUTES` KV on every push/commit, and included `oldOid` and `commitOid` in `refVariants` in `commitFile.ts` so OID-keyed `/_cache/readme` and `/_cache/owner-profile-readme` entries are evicted immediately.
- **Out-of-Scope Modifications**: `None`.

### Completed -> Phase 04: SSR Error Boundary Shell Context, 500 Sanitization & Blob Activity Parity

- **Completion Timestamp**: `2026-11-26`
- **Locked Bugs Resolved**:
  1. `BUG-NEW-08` (**MEDIUM**): Added `resolvePublicErrorMessage` and `loadSiteBranding(env)` to `handleError` in `src/client/server/error.ts`, extended `badRequest` in `src/worker/routes/ui/helpers.ts` to accept `viewer`, updated `tree.ts` 404 path-not-found to use `renderUiDocumentResponse`, and threaded `viewer` through all `badRequest` and `handleError` calls in `tree.ts`, `blob.ts`, `commits.ts`, `overview.ts`, and `helpers.ts`.
  2. `BUG-NEW-09` (**MEDIUM**): Updated `handleRefsApi` in `src/worker/routes/ui/refsApi.ts` and all 5 remaining catch blocks in `src/worker/routes/admin.ts` (`POST /admin/compact`, `DELETE /admin/compact`, `GET /admin/debug-commit/:commit`, `GET /admin/debug-oid/:oid`, `DELETE /admin/pack/:packKey`) to log structured warnings and return sanitized 500 JSON responses.
  3. `BUG-NEW-11` (**LOW**): Updated `handleBlob` in `src/worker/routes/ui/blob.ts` to load `progress = await loadUiRepoActivity(env, access)` and pass `progress` to `renderBlobDocumentResponse`.
- **Exact Files Modified**:
  - `src/client/server/error.ts`
  - `src/worker/routes/ui/helpers.ts`
  - `src/worker/routes/ui/tree.ts`
  - `src/worker/routes/ui/blob.ts`
  - `src/worker/routes/ui/commits.ts`
  - `src/worker/routes/ui/overview.ts`
  - `src/worker/routes/ui/refsApi.ts`
  - `src/worker/routes/admin.ts`
  - `test/phase04-logic.node-test.ts`
- **Verification Gates Passed**:
  - `npm run typecheck` (`0` errors)
  - `npx tsc --noEmit` (`0` errors)
  - `npx --yes tsx --test test/phase04-logic.node-test.ts` (`7/7` tests pass)
  - `npm run test` (`14/14` suites, `74/74` tests pass)
  - `npm run format:check` (`PASS`)
- **Out-of-Scope Modifications**: `None (0 files outside Phase 04 Scope Lock touched)`.

---

## 3. Remaining Phases Queue (`0 / 4` Remaining)

All 4 phases (`BUG-NEW-01` through `BUG-NEW-12`) have been implemented and verified.
