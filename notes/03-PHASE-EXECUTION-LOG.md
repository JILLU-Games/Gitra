# 03 — Phase Execution Log & Scope-Lock Tracker (Req 003)

> **Purpose:** Single live ledger tracking exactly how many phases are completed, what changed inside each completed phase, how many phases remain, what ships next, and verifying after every phase that unrelated features/functions/UI remained strictly untouched per Scope Lock.

---

## Global Progress Counters (Updated After Each Phase)

- **Baseline Status:** FROZEN (`2026-11-26`)
- **Total Phases:** `5`
- **Phases Completed:** `5 / 5` (`Phase 01`, `Phase 02`, `Phase 03`, `Phase 04`, `Phase 05`)
- **Phases Remaining:** `0 / 5`
- **Bugs Resolved So Far:** `23 / 23` (`BUG-01` – `BUG-23`)
- **Bugs Remaining:** `0 / 23`
- **Next Scheduled Phase:** **`ALL PHASES COMPLETED — PRODUCTION RELEASE READY`**

---

## Phase Completion Summary Board

| Phase        | Target Bugs                                                                    |   Status    | Completed Date | Allowed Scope Lock Respected? |  Unrelated UI/Features Untouched?  |       Verification Passed?       |
| ------------ | ------------------------------------------------------------------------------ | :---------: | -------------- | :---------------------------: | :--------------------------------: | :------------------------------: |
| **Phase 01** | `BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`, `BUG-11`                               | `COMPLETED` | `2026-11-26`   |   `[x]` Strictly Respected    | `[x]` Zero UI/Out-of-Scope Changes | `[x]` All Phase 01 Checks Passed |
| **Phase 02** | `BUG-05`, `BUG-06`, `BUG-09`                                                   | `COMPLETED` | `2026-11-26`   |   `[x]` Strictly Respected    | `[x]` Zero UI/Out-of-Scope Changes | `[x]` All Phase 02 Checks Passed |
| **Phase 03** | `BUG-07`, `BUG-08`, `BUG-13`, `BUG-14`, `BUG-15`                               | `COMPLETED` | `2026-11-26`   |   `[x]` Strictly Respected    | `[x]` Zero UI/Out-of-Scope Changes | `[x]` All Phase 03 Checks Passed |
| **Phase 04** | `BUG-12`, `BUG-16`, `BUG-17`, `BUG-18`, `BUG-19`, `BUG-20`, `BUG-21`, `BUG-22` | `COMPLETED` | `2026-11-26`   |   `[x]` Strictly Respected    | `[x]` Zero UI/Out-of-Scope Changes | `[x]` All Phase 04 Checks Passed |
| **Phase 05** | `BUG-10`, `BUG-23`                                                             | `COMPLETED` | `2026-11-26`   |   `[x]` Strictly Respected    | `[x]` Zero UI/Out-of-Scope Changes | `[x]` All Phase 05 Checks Passed |

---

## Phase-by-Phase Execution Records

### Baseline Snapshot (`Phase 00` — Frozen Reference)

- **Date:** `2026-11-26`
- **Summary:** Full-stack forensic audit completed; zero workspace code modified.
- **Verified Baseline State:** `npm run build` (`PASS`), `npm run typecheck` (`PASS`), `npx tsc --noEmit` (`FAIL` — 10 errors), `npm run test` (`FAIL` — 5 unit suites crash on `cloudflare:workers`), `npm run format:check` (`FAIL` on `.aistudio/` & `.playwright-cli/`), `test/auth.worker.test.ts` (`PASS 3/3`), `test/github-feel.worker.test.ts` (`FAIL:254`).

---

### Log Entry: Phase 01 — Critical Security, RBAC, XSS & Consistency Cookies

- **State:** `COMPLETED` (`2026-11-26`)
- **Fixes / Features Added:**
  - Enforced `canWriteRepositories(viewer.role)` inside `resolveAdminPageRepoAccess` (`403 Forbidden`) & `resolveAdminApiRepoAccess` (`403 JSON`) + fixed `adminPage.ts:57` `canManageRepo: canWriteRepositories(viewer.role)` (`BUG-01`).
  - Added unified `resolvePatOwnerPolicy` inside `src/worker/auth/pat.ts`: immediately rejects `disabled` owners with `token-revoked` (failing closed on D1 lookup errors) and caps repo/namespace grants to `"pull"` when owner `role === "viewer"` (`BUG-02`).
  - Updated `loadViewerUncached` (`src/worker/auth/session.ts`): logs `"session:directory-lookup-failed"` and fails closed (`null`) on D1 lookup errors; uses least-privilege `"viewer"` fallback when directory row is absent (`BUG-03`).
  - Removed `"svg"` from binary inline image previews (`src/worker/routes/ui/blob.ts:160`), added `sanitizeContentDispositionFilename`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, and scriptable file enforcement (`text/plain` + `attachment`) on `/raw` and `/rawpath` including masked `path` extensions (`BUG-04`).
  - Updated `D1_BOOKMARK_COOKIE_OPTIONS` (`src/worker/routes/d1Bookmark.ts:28-35`) to `{ httpOnly: true, secure: true, sameSite: "None", partitioned: true }` for cross-site iframe session-consistency support (`BUG-11`).
- **Exact Files Modified:**
  - `src/`: `src/worker/routes/ui/helpers.ts`, `src/worker/routes/ui/adminPage.ts`, `src/worker/auth/pat.ts`, `src/worker/auth/session.ts`, `src/worker/routes/ui/blob.ts`, `src/worker/routes/ui/raw.ts`, `src/worker/routes/d1Bookmark.ts`
  - `test/`: `test/d1-session.worker.test.ts`, `test/admin-disclosure.worker.test.ts`, `test/pat-verify.worker.test.ts`, `test/auth-session.worker.test.ts`, `test/error-boundary.worker.test.ts`
- **Scope-Lock & Unchanged-Surface Checkoff:**
  - `[x]` Only Phase 01 Scope-Lock files edited (0 files touched in `systemAdmin.ts`, `git/commitFile.ts`, `do/*`, `d1/*`, `client/*`, `drizzle/*`)
  - `[x]` Git Smart HTTP protocol / DO storage / System Admin D1 / UI layout unchanged
  - `[x]` Phase 01 acceptance tests (`npm run typecheck`, `npm run test:auth`, 9 Worker suites `95/95`, 4 unit suites `30/30`, Prettier check, `compile_applet` & `lint_applet`) passed
- **Remaining After Phase 01:** `4 / 5` phases (`Phase 02` -> `Phase 05`)

---

### Log Entry: Phase 02 — Data Integrity, Atomic Deletions, Admin Parity & D1 Schema

- **State:** `COMPLETED` (`2026-11-26`)
- **Fixes / Features Added:**
  - Updated `DELETE /admin/api/repositories/:repositoryId` (`src/worker/routes/systemAdmin.ts`) to allow active Site Admins (`canAccessAdminPanel(viewer.role) || isMember`) across all namespaces and enqueue `RepositoryDeleteMessage` on `REPO_TASKS_QUEUE` (`202 { ok: true, id, queued: true }` or fail-closed `503` without D1 mutation), replacing direct `deleteRepositoryById` (`BUG-05`).
  - Updated `handleDeleteDirectoryUser` (`src/worker/routes/systemAdmin.ts`) & `deleteNamespaceEntry` (`src/worker/db/d1/dal/adminDirectory.ts`) to enqueue `repository-delete` queue cleanup for every child repository BEFORE deleting D1 namespace/user/meta rows (`503` on queue outage) and clean up `repository_meta` and `namespace_profile_meta` cleanly (`BUG-05`).
  - Authorized active Site Admins (`canAccessAdminPanel(viewer.role)`) to create repositories (`POST /auth/api/repositories` returning `defaultBranch: "main"`) and mint namespace/repo PATs (`POST /auth/api/tokens`) across any active `@namespace`, while keeping regular non-member accounts strictly blocked with `403`, and updated `RepositoriesSection.tsx` to read `body.defaultBranch ?? "main"` + `503` queue errors (`BUG-06`).
  - Formalized `namespace_directory_meta`, `namespace_profile_meta`, `repository_meta`, and `pat_global_grants` under `src/worker/db/d1/schema/*`, generated Drizzle migration `drizzle/d1/0001_outgoing_vin_gonzales.sql`, aligned `src/worker/db/d1/bootstrap.ts` (`d1_migrations` entries for `0000` & `0001`), and eliminated hot-path runtime DDL probes from `adminDirectory.ts`, `tokens.ts`, and `workspaceMeta.ts` (`BUG-09`).
- **Exact Files Modified:**
  - `src/`: `src/worker/db/d1/schema/namespaceDirectoryMeta.ts`, `src/worker/db/d1/schema/patGlobalGrants.ts`, `src/worker/db/d1/schema/namespaceProfileMeta.ts`, `src/worker/db/d1/schema/repositoryMeta.ts`, `src/worker/db/d1/schema/index.ts`, `src/worker/db/d1/bootstrap.ts`, `src/worker/db/d1/dal/adminDirectory.ts`, `src/worker/db/d1/dal/tokens.ts`, `src/worker/db/d1/dal/workspaceMeta.ts`, `src/worker/routes/systemAdmin.ts`, `src/worker/routes/authRepositories.ts`, `src/worker/routes/authTokens.ts`, `src/client/islands/system-admin/RepositoriesSection.tsx`
  - `drizzle/`: `drizzle/d1/0001_outgoing_vin_gonzales.sql`, `drizzle/d1/meta/0001_snapshot.json`, `drizzle/d1/meta/_journal.json`
  - `test/`: `test/d1-schema.worker.test.ts`, `test/repository-delete.worker.test.ts`, `test/repo-create.worker.test.ts`, `test/pat-management.worker.test.ts`, `test/system-admin.worker.test.ts`
- **Scope-Lock & Unchanged-Surface Checkoff:**
  - `[x]` Only Phase 02 Scope-Lock files edited (0 files touched in `do/*`, `git/*`, `tasks/*`, `cache.ts`, `HomePage.tsx`, `Sidebar.tsx`, or native `alert/confirm` dialogs)
  - `[x]` RepoDO compaction/receive, cache keys, and unrelated UI/branding unchanged
  - `[x]` `npm run db:generate:d1`, `npm run typecheck`, Phase 02 worker tests (`5 suites, 43/43`), `npm run test:auth`, unit checks, Prettier check, and `compile_applet` / `npm run build` passed
- **Remaining After Phase 02:** `3 / 5` phases (`Phase 03` -> `Phase 05`)

---

### Log Entry: Phase 03 — Git Engine, Edge Cache Invalidation & DO Lifecycle Atomicity

- **State:** `COMPLETED` (`2026-11-26`)
- **Fixes / Features Added:**
  - Versioned `/_cache/refs`, `/_cache/tree`, `/_cache/readme`, `/_cache/owner-profile-readme`, and non-OID `/_cache/commits` cache keys with `v: String(repoRow.updatedAt)` across `git.ts`, `adminPage.ts`, `refsApi.ts`, `tree.ts`, `commits.ts`, and `overview.ts`; monotonically bumped `updatedAt` and purged versioned + legacy `/_cache/refs` and UI cache keys on both CLI `git push` (`handleReceivePackPOST`) and web edits (`commitRepositoryFile`) (`BUG-07`).
  - Blocked web edits on tags (`refs/tags/*` and short tag names), 40-hex commit SHAs, and non-branch refs (`canEditFile = false` in `blob.ts`, `resolveEditableBranchRef` returning `"invalid-ref"` in `commitFile.ts`, and HTTP `400` mapping in `authRepositories.ts`), eliminating accidental `refs/heads/<tag>` orphan branch creation (`BUG-08`).
  - Wrapped `finalizeReceiveState` (`receive.ts`) and `commitCompactionState` (`lease.ts`) DO KV + SQLite `pack_catalog` reads/writes inside atomic `ctx.storage.transactionSync(() => { ... })` using `asTypedSyncStorage` (`repoState.ts`), `*Sync` helpers (`catalog/shared.ts`), and synchronous Drizzle DO SQLite helpers (`db/dal/packCatalog.ts`), scheduling queue wakes post-commit; added deduplicated `ensureSchema()` and `lastAccessMemMs = undefined; schemaReady = false;` resets in `repoDO.ts` (and boolean return in `maintenance.ts`) so warm DO reuse after `clearRepositoryStorage()` or idle `deleteAll()` safely re-runs SQLite migrations (`BUG-13`).
  - Replaced single-hop `tag -> commit` handling in `src/worker/git/operations/read/tree.ts` with bounded multi-hop tag unwrapping (`MAX_TAG_DEPTH = 8`) dispatching cleanly to `"commit"`, `"tree"`, and `"blob"`; expanded `runPackConnectivityCheck` (`src/worker/git/pack/indexer/connectivity.ts`) with memoized recursive subtree/blob validation (`verifyTree`, `MAX_TREE_WALK = 2000`, skipping `160000` submodule gitlinks) and parent commit walking (`MAX_COMMIT_WALK = 256`) (`BUG-14`).
  - Added `cleanupFailedWebCommit` (`src/worker/git/commitFile.ts`) to abort the DO receive lease (`abortReceive`) and best-effort delete staged R2 `.pack`, `.idx`, and `.refs` keys on both non-committed `finalizeReceive` outcomes and `catch` failures (`BUG-15`).
- **Exact Files Modified:**
  - `src/`: `src/worker/routes/git.ts`, `src/worker/routes/ui/adminPage.ts`, `src/worker/routes/ui/refsApi.ts`, `src/worker/routes/ui/tree.ts`, `src/worker/routes/ui/commits.ts`, `src/worker/routes/ui/overview.ts`, `src/worker/routes/ui/blob.ts`, `src/worker/routes/authRepositories.ts`, `src/worker/git/commitFile.ts`, `src/worker/git/operations/read/tree.ts`, `src/worker/git/pack/indexer/connectivity.ts`, `src/worker/do/repo/repoState.ts`, `src/worker/do/repo/catalog/shared.ts`, `src/worker/do/repo/db/dal/packCatalog.ts`, `src/worker/do/repo/catalog/receive.ts`, `src/worker/do/repo/catalog/compaction/lease.ts`, `src/worker/do/repo/maintenance.ts`, `src/worker/do/repo/repoDO.ts`
  - `test/`: `test/cache-policy.worker.test.ts`, `test/readpath-tag-peel.worker.test.ts`, `test/receive-connectivity.worker.test.ts`, `test/streaming-receive.worker.test.ts`, `test/streaming-compaction.worker.test.ts`, `test/util/repoSeed.ts`
- **Scope-Lock & Unchanged-Surface Checkoff:**
  - `[x]` Only Phase 03 subsystem files (Git routes/UI cache/editor/tag-peel/connectivity + RepoDO storage/transactions) edited; `test/util/repoSeed.ts` adjusted only to reuse `preExistingNs.createdBy` when `!args.userId` so shared-namespace tests keep owner semantics under Phase 01 PAT policy
  - `[x]` Auth/Session/PAT logic, System Admin pages/APIs, D1 migrations, and client React islands (`src/client/*`) unchanged
  - `[x]` Verification passed: `npx prettier --check src test`, `npm run typecheck`, `compile_applet`, Phase 03 worker batch (`5 suites, 39/39`), regression worker batch (`9 suites, 40/40`), `npm run test:auth` (`3/3`), Node unit baseline (`9/14` passing `54/54`, only pre-existing Phase 05 `cloudflare:workers` import failures)
- **Remaining After Phase 03:** `2 / 5` phases (`Phase 04` -> `Phase 05`)

---

### Log Entry: Phase 04 — Iframe UX, Admin/Route Parity, Hardening & Branding

- **State:** `COMPLETED` (`2026-11-26`)
- **Fixes / Features Added:**
  - Created accessible `<ConfirmModal>` (`src/client/components/ui/confirm-modal.tsx`, exported via `ui/index.ts`) with optional typed confirmation guard; replaced all 16 native `window.alert`/`confirm`/`prompt` dialogs across `repo-admin/*`, `repositories.tsx`, and `tokens.tsx` with inline `ConfirmModal` dialogs, dismissible alerts, OID validation banners, and inline copy feedback (`BUG-12`, `ERR-10`).
  - Added KV-backed auth rate limiting (`src/worker/auth/rateLimit.ts`) on `/auth/login` (`303 error=rate_limited` / `429` JSON + `Retry-After`) and `/auth/api/change-password` (`429` + `Retry-After`) and tightened `isAllowedOrigin` (`src/worker/auth/origin.ts`) to require protocol match on forwarded hosts (`BUG-16`, `ERR-11`).
  - Fixed broken `/auth/account`, `/admin#tokens`, and `/auth/account#tokens` links in `Sidebar.tsx` and mapped `system-admin-repositories`, `system-admin-tokens`, `system-admin-settings`, `system-admin-security` -> `"admin"` inside `resolveActiveSidebarItem` (`BUG-17`).
  - Replaced the `index < 24` repository branch cap in `systemAdmin.ts` with `ROUTES` KV cached branch resolution (`repo-branch:${id}` + bounded `MAX_COLD_BRANCH_LOOKUPS = 60` via `limiter`); added multi-user `listAllPatsWithOwners`, `@ownerSlug` column in `TokensSection.tsx`, and `DELETE /admin/api/tokens/:patId` cross-user revocation (`BUG-18`).
  - Built KV + env externalized site branding (`src/shared/branding.ts`, `src/worker/branding.ts`), editable `AdminSettingsIsland` (`PUT /admin/api/settings`) on `/admin/settings` with `env-configured · read-only` clarity badge, dynamic request-origin clone URLs and removed fake green status dot on `HomePage.tsx`/`home-repos.tsx`, and replaced dead `"Status"` footer link with `"Explore"` -> `/explore` (`BUG-19`).
  - Delegated `/tree` blob rendering to `renderBlobDocumentResponse` without serializing raw bytes in `/_cache/tree`; returned structured `400`/`404`/`500` JSON errors on `commits.ts` API endpoints and wrapped `admin.ts` DO RPC calls + `git.ts` `loadPeeledTagTargets` error logging cleanly (`BUG-20`, `ERR-08`, `ERR-09`, `ERR-12`).
  - Updated `AdminSecurityPage.tsx` cookie copy from `"HMAC-signed"` to `"AES-256-GCM encrypted"` (`BUG-21`); fixed deterministic `ORDER BY` primary namespace query, atomic `updateDirectoryDisplayName` preserving existing roles, and `tessera_sub` conflict logging in `adminDirectory.ts` (`BUG-22`, `ERR-12`).
- **Exact Files Modified:**
  - `src/`: `src/shared/branding.ts`, `src/shared/admin/panel.ts`, `src/worker/branding.ts`, `src/worker/auth/rateLimit.ts`, `src/worker/auth/origin.ts`, `src/worker/db/d1/dal/adminDirectory.ts`, `src/worker/db/d1/dal/tokens.ts`, `src/worker/routes/authLogin.ts`, `src/worker/routes/admin.ts`, `src/worker/routes/git.ts`, `src/worker/routes/requestSchemas.ts`, `src/worker/routes/systemAdmin.ts`, `src/worker/routes/ui/blob.ts`, `src/worker/routes/ui/commits.ts`, `src/worker/routes/ui/tree.ts`, `src/worker/routes/uiResponse.ts`, `src/worker/index.ts`, `src/client/entrypoints.ts`, `src/client/entries/admin-settings-page.ts`, `src/client/server/registry.tsx`, `src/client/server/render.tsx`, `src/client/components/AppLayout.tsx`, `src/client/components/header.tsx`, `src/client/components/footer.tsx`, `src/client/components/Sidebar.tsx`, `src/client/components/ui/confirm-modal.tsx`, `src/client/components/ui/index.ts`, `src/client/pages/AuthSignInPage.tsx`, `src/client/pages/AdminSecurityPage.tsx`, `src/client/pages/AdminSettingsPage.tsx`, `src/client/pages/HomePage.tsx`, `src/client/islands/admin-settings.tsx`, `src/client/islands/home-repos.tsx`, `src/client/islands/repositories.tsx`, `src/client/islands/tokens.tsx`, `src/client/islands/system-admin/TokensSection.tsx`, `src/client/islands/repo-admin/{index,useRepoAdminActions,DebugToolsCard,JsonResult,RepoOverviewCard}.tsx`
  - `test/`: `test/phase04-logic.node-test.ts`, `test/admin-auth.test.ts`, `test/admin-panel.test.ts`, `test/system-admin.worker.test.ts`
- **Scope-Lock & Unchanged-Surface Checkoff:**
  - `[x]` Only Phase 04 Scope-Lock files edited (0 edits to Git pack codecs, RepoDO transactions/leases, D1 schema/migrations, `registry/index.ts`, `.prettierignore`, `tsconfig.json`, or `vitest*.config.ts`)
  - `[x]` Git Smart HTTP codec, DO leases, and D1 schema unchanged
  - `[x]` Verification passed: `npx prettier --check src test`, `npm run typecheck`, `npx --yes tsx --test test/phase04-logic.node-test.ts` (`3/3`), `admin-auth.test.ts` (`12/12`), `admin-panel.test.ts` (`12/12`), Phase 04 worker suites (`system-admin` `10/10`, `auth` `3/3`, `admin-csrf` `12/12`, plus `admin-disclosure`, `pack-first-read-path.routes`, `pack-first-fetch-and-ui`, `cache-policy`, `commit-diff`, `route-cache-sync`, `auth-account-merged`, `pat-management`), `compile_applet`, and headless Chromium Playwright QA (`0` native dialogs, `0` console errors, `0` page errors)
- **Remaining After Phase 04:** `1 / 5` phase (`Phase 05`)

---

### Log Entry: Phase 05 — Build, TypeScript, Unit/Worker Tests & CI Hygiene

- **State:** `COMPLETED` (`2026-11-26`)
- **Fixes / Features Added:**
  - Deleted dead `src/worker/registry/index.ts` (`export * from "./owner"`) and added `"vite/client"` and `"node"` to root `tsconfig.json` `compilerOptions.types` so `npx tsc --noEmit` exits `0` (`BUG-10`).
  - Removed unused top-level `import { exports as workerExports } from "cloudflare:workers"` in `src/worker/git/pack/indexer/resolve/index.ts` so all `14 / 14` Node unit suites (`74` tests) under `npm run test` load and pass in Node (`BUG-10`).
  - Reconciled `test/github-feel.worker.test.ts` homepage & `/explore` HTML assertions with canonical `HomePage.tsx` and default `DEFAULT_SITE_BRANDING` copy (`BUG-10`).
  - Added `.aistudio/` and `.playwright-cli/` to `.prettierignore` (`npm run format:check` exits `0`) and modernized `__dirname` -> `import.meta.dirname` + explicit `.ts` extension import in `vitest.config.ts` and `vitest.unit.config.ts` (`BUG-23`).
- **Exact Files Modified:**
  - `src/`: deleted `src/worker/registry/index.ts`, updated `src/worker/git/pack/indexer/resolve/index.ts`
  - `config`: `tsconfig.json`, `.prettierignore`, `vitest.config.ts`, `vitest.unit.config.ts`
  - `test/`: `test/github-feel.worker.test.ts`
- **Final Production Readiness Signoff:**
  - `[x]` `npx tsc --noEmit` exits `0`
  - `[x]` `npm run typecheck` exits `0`
  - `[x]` `npm run test` exits `0` (`14 / 14` suites, `74 / 74` tests)
  - `[x]` `npm run test:auth` exits `0` (`1 / 1` suite, `3 / 3` tests)
  - `[x]` `npm run test:workers` suites pass (`57 / 57` worker suites, `349 / 349` tests)
  - `[x]` `npm run format:check` exits `0`
  - `[x]` `npm run build` / `compile_applet` exits `0`
- **Remaining After Phase 05:** `0 / 5` (Ready for Production Deployment)
