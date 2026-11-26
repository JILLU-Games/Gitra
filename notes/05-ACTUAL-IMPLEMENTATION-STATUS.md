# 05 — ACTUAL IMPLEMENTATION STATUS & FEATURE LEDGER

- **Document ID**: `005-ACTUAL-IMPLEMENTATION-STATUS`
- **Baseline Reference**: `/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md`
- **Current Phase Progress**: `Phase 04 Completed (4 / 4 Phases Executed — 100% Complete)`

---

## 1. Currently Working Actual Production & Demo Features (Live Status After Phase 04)

| Feature Domain                        | Specific Capability                                                                                                                                                                                                                                                                           | Backend / Storage Engine                                                               | Production Status                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Git Smart HTTP v2**                 | `GET /:owner/:repo/info/refs?service=git-upload-pack` & `git-receive-pack`                                                                                                                                                                                                                    | Worker + D1 + `RepoDurableObject`                                                      | **100% Working**                                   |
| **Git Clone / Fetch**                 | `POST /:owner/:repo/git-upload-pack` (`ls-refs`, streaming `fetch`, delta assembly)                                                                                                                                                                                                           | Worker + R2 (`REPO_BUCKET`) + DO Pack Catalog                                          | **100% Working**                                   |
| **Git Push**                          | `POST /:owner/:repo/git-receive-pack` (lease lock, streaming R2 upload, 2-pass indexer, `.idx` + `.pi` generation, ref commit, compaction queue, `repo-branch` KV eviction)                                                                                                                   | Worker + R2 + DO SQLite + D1 + `ROUTES` KV + `REPO_TASKS_QUEUE`                        | **100% Working (Upgraded in Phase 03)**            |
| **Authentication & Primary Handle**   | Primary Admin (`AUTH_ADMIN_PASSWORD`) + Directory User login (`user_credentials`), Argon2id verify, rate limiting, rotating session cookies, deterministic owned-namespace `primaryNamespaceSlug` (`BUG-NEW-01` fixed)                                                                        | `AuthDurableObject` + D1 (`users`, `sessions`, `user_credentials`, `namespaces`)       | **100% Working (Upgraded in Phase 01)**            |
| **Personal Access Tokens**            | Mint, list, and revoke PATs (`goc_...`) with `namespace`, `repo`, and admin `global` (`*`) scopes (`pull` / `push`)                                                                                                                                                                           | D1 (`personal_access_tokens`, `pat_namespace_grants`, `pat_repo_grants`)               | **100% Working**                                   |
| **Repository Lifecycle & KV Hygiene** | Create repo (with optional `README.md` or `.vibtools/profile/README.md`), toggle `public`/`private`, edit description, pin to profile, pin to homepage, public-only `ROUTES` KV policy in demo seeder, full `ROUTES` + `repo-branch` KV cleanup on delete (`BUG-NEW-06`, `BUG-NEW-07` fixed)  | D1 (`repositories`) + `ROUTES` KV + `RepoDurableObject` + R2                           | **100% Working (Upgraded in Phase 03)**            |
| **Site Admin Cross-Namespace RBAC**   | Site Admin (`role === "admin"`) access to `"Storage"` (`/:owner/:repo/admin`), private repository views, `/:owner` private repo listings, and cross-namespace web file & `.vibtools` profile README commits (`BUG-NEW-02`, `BUG-NEW-03` fixed)                                                | `src/worker/routes/ui/helpers.ts`, `overview.ts`, `authRepositories.ts`                | **100% Working (Upgraded in Phase 01)**            |
| **Web File Editor & Commit Engine**   | In-browser file editing & markdown preview (`BlobEditorIsland`, `ProfileReadmeEditorIsland`) producing real Git commits & packfiles, preserving `100755` executable mode, rejecting file/directory conflicts, enqueuing compaction, and evicting OID-keyed README caches (`BUG-NEW-12` fixed) | `commitRepositoryFile` (`src/worker/git/commitFile.ts`) + R2 + DO + `REPO_TASKS_QUEUE` | **100% Working (Upgraded in Phase 02 & Phase 03)** |
| **Repository Browsing UI**            | Repo overview, README rendering, branch/tag ref switcher, tree browser, syntax-highlighted blob view (with live repo activity banner: `BUG-NEW-11` fixed), raw download, commit history, commit diff, and error boundary preserving custom branding & viewer (`BUG-NEW-08` fixed)             | SSR Pages + Hydrated Islands + R2 Pack Reader + Cache API                              | **100% Working (Upgraded in Phase 04)**            |
| **System Admin Console & Repo Admin** | `/admin/*` & `/:owner/:repo/admin/*` (with full D1/KV/cache invalidation on `HEAD` & `refs` updates and structured logging + sanitized 500 JSON responses: `BUG-NEW-05`, `BUG-NEW-09` fixed)                                                                                                  | `systemAdmin.ts`, `admin.ts`, D1, KV, R2, DO, Queues                                   | **100% Working (Upgraded in Phase 03 & Phase 04)** |

---

## 2. Phase-by-Phase Production Upgrade Tracker

| Phase        | Bug IDs      | Feature / Subsystem Being Upgraded to 100% Production Readiness                                                                                                                   | Current Status           |
| ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Phase 01** | `BUG-NEW-01` | User-owned namespace (`createdBy === userId`) priority in `listNamespacesForUser` so admin-created accounts never hijack `viewer.primaryNamespaceSlug` or `/user/profile` updates | **COMPLETED (Phase 01)** |
| **Phase 01** | `BUG-NEW-02` | Site Admin (`role === "admin"`) access to `"Storage"` (`/:owner/:repo/admin`), private repository pages, and private repos on `/:owner` across non-member namespaces              | **COMPLETED (Phase 01)** |
| **Phase 01** | `BUG-NEW-03` | Site Admin (`role === "admin"`) authorization on `PUT /auth/api/repositories/:id/file` and `PUT /auth/api/repositories/:id/profile-readme`                                        | **COMPLETED (Phase 01)** |
| **Phase 02** | `BUG-NEW-04` | Automatic `REPO_TASKS_QUEUE` compaction task dispatch after web file commits when `finalized.shouldQueueCompaction` is true                                                       | **COMPLETED (Phase 02)** |
| **Phase 02** | `BUG-NEW-10` | Executable file mode (`100755`) preservation and file-vs-directory path conflict rejection in `upsertTreePath`                                                                    | **COMPLETED (Phase 02)** |
| **Phase 03** | `BUG-NEW-05` | D1 `repositories.updatedAt` bump, `repo-branch:<id>` KV eviction, and `/_cache/refs` purge on `PUT /:owner/:repo/admin/head` & `PUT /:owner/:repo/admin/refs`                     | **COMPLETED (Phase 03)** |
| **Phase 03** | `BUG-NEW-06` | `repo-branch:<repositoryId>` KV eviction during `handleRepositoryDeleteMessage`                                                                                                   | **COMPLETED (Phase 03)** |
| **Phase 03** | `BUG-NEW-07` | Public-only `ROUTES` KV invariant for seeded demo repositories (`infra-notes` excluded) and namespace-scoped check in `ensureDemoRepositoriesSeeded`                              | **COMPLETED (Phase 03)** |
| **Phase 03** | `BUG-NEW-12` | `repo-branch:<repositoryId>` KV eviction on push/web-commit and aligned README cache invalidation keys                                                                            | **COMPLETED (Phase 03)** |
| **Phase 04** | `BUG-NEW-08` | Custom site branding and signed-in `viewer` preservation on all SSR error/400/404 pages + 500 error message sanitization when `LOG_LEVEL !== "debug"`                             | **COMPLETED (Phase 04)** |
| **Phase 04** | `BUG-NEW-09` | Structured warning logs and sanitized 500 JSON responses in `handleRefsApi` and all remaining `routes/admin.ts` endpoints                                                         | **COMPLETED (Phase 04)** |
| **Phase 04** | `BUG-NEW-11` | Active repository receive/compaction status banner (`loadUiRepoActivity`) on direct `GET /:owner/:repo/blob` requests                                                             | **COMPLETED (Phase 04)** |

---

## 3. Completed Phase Upgrades Log

### Phase 01 Completed (`2026-11-26`)

- **`BUG-NEW-01` Fixed**: `sortNamespacesForUser` & `listNamespacesForUser` in `src/worker/db/d1/dal/namespaces.ts:51-77` prioritize `createdBy === userId`.
- **`BUG-NEW-02` Fixed**: `resolveUiRepoAccess`, `resolveAdminPageRepoAccess`, `resolveAdminApiRepoAccess` (`src/worker/routes/ui/helpers.ts`), and `handleOwnerOverview` (`src/worker/routes/ui/overview.ts`) authorize Site Admins (`canAccessAdminPanel(viewer.role)`).
- **`BUG-NEW-03` Fixed**: `PUT /auth/api/repositories/:repositoryId/profile-readme` and `PUT /auth/api/repositories/:repositoryId/file` (`src/worker/routes/authRepositories.ts`) authorize Site Admins (`canAccessAdminPanel(viewer.role)`).

### Phase 02 Completed (`2026-11-26`)

- **`BUG-NEW-04` Fixed**: `commitRepositoryFile` (`src/worker/git/commitFile.ts:395-412`) enqueues `{ kind: "compaction", doId: stub.id.toString(), repoId: input.doName }` on `input.env.REPO_TASKS_QUEUE` when `finalized.shouldQueueCompaction` is true.
- **`BUG-NEW-10` Fixed**: `resolveUpsertTreeEntryPlan` & `upsertTreePath` (`src/worker/git/commitFile.ts:133-240`) preserve `100755` executable mode and reject file-vs-directory or non-regular entry (`40000`, `120000`, `160000`) path conflicts with `{ ok: false, reason: "invalid-path", detail }`.

### Phase 03 Completed (`2026-11-26`)

- **`BUG-NEW-05` Fixed**: `invalidateRepoRefsAndBranchCache` (`src/worker/routes/admin.ts:30-45`) bumps `repositories.updatedAt`, deletes `repo-branch:<repositoryId>` from `ROUTES` KV, and purges `/_cache/refs` on `PUT /:owner/:repo/admin/refs` and `PUT /:owner/:repo/admin/head`.
- **`BUG-NEW-06` Fixed**: `handleRepositoryDeleteMessage` (`src/worker/tasks/repositoryDelete.ts:72`) deletes `repo-branch:<repositoryId>` from `ROUTES` KV alongside `deleteRouteCacheRecord`.
- **`BUG-NEW-07` Fixed**: `seedSingleDemoRepository` (`src/worker/auth/demoSeed.ts:912-921`) writes to `ROUTES` KV only for `public` repositories (and deletes any entry for private repositories like `infra-notes`), while `ensureDemoRepositoriesSeeded` and `ensureDemoTestUserSeeded` check `listRepositoriesInNamespace`.
- **`BUG-NEW-12` Fixed**: `handleReceivePackPOST` (`src/worker/routes/git.ts:227`) and `commitRepositoryFile` (`src/worker/git/commitFile.ts:437, 443-445`) delete `repo-branch:<repositoryId>` and include `oldOid` and `commitOid` in `refVariants` when purging `/_cache/readme` and `/_cache/owner-profile-readme`.

### Phase 04 Completed (`2026-11-26`)

- **`BUG-NEW-08` Fixed**: `resolvePublicErrorMessage` & `handleError` (`src/client/server/error.ts:58-120`) mask non-debug 500 error messages as `"Internal Server Error"`, load `loadSiteBranding(env)`, and thread `viewer` through `badRequest` and `handleError` in `helpers.ts`, `tree.ts`, `blob.ts`, `commits.ts`, and `overview.ts`.
- **`BUG-NEW-09` Fixed**: `handleRefsApi` (`src/worker/routes/ui/refsApi.ts:32-49`) and all 5 remaining catch blocks in `src/worker/routes/admin.ts` log structured warnings and return sanitized 500 JSON responses.
- **`BUG-NEW-11` Fixed**: `handleBlob` (`src/worker/routes/ui/blob.ts:245-253`) loads `progress = await loadUiRepoActivity(env, access)` and passes `progress` to `renderBlobDocumentResponse`.
