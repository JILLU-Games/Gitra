# 03 · Phase Execution & Scope-Lock Log

**Current Progress:** `5 / 5` update phases implemented (`Phase 01`, `Phase 02`, `Phase 03`, `Phase 04`, `Phase 05` Completed on **2026-11-26** — `21 / 21` findings resolved)  
**Next Active Phase:** _None — All Planned Remediation Phases Complete_  
**Total Remaining Phases:** **0** (`100%` complete)

---

## Global Anti-Drift & Scope-Lock Rules

1. Execute **one phase at a time** in strict order (`01 → 02 → 03 → 04 → 05`).
2. Before modifying any file, verify the file path is explicitly inside that phase's **Allowed Paths** in `notes/01-PRODUCTION-FIX-PATCH-SPEC.md`.
3. Never alter, rename, refactor, or restyle unrelated features/UI outside the active phase's Scope Lock.
4. After each phase passes its verification gate, update this log immediately (`Status`, `Changed Files`, `Added/Fixed Features`, `Next Phase`).

---

## Phase Ledger

### Phase 00 — Baseline Freeze & Forensic Audit

- **Status:** `COMPLETED` (2026-11-26)
- **What Was Done:**
  - Read and verified live runtime code across Worker routes, Auth, D1/DO/R2/KV/Queues, Git protocol, React SSR/islands, and deploy scripts.
  - Executed baseline validation commands (`typecheck`: PASS, `test`: PASS `75/75`, `cf-auto-deploy.node-test`: PASS `8/8`, `build`: PASS, `format:check`: FAIL on 2 files, `test:workers`: FAIL `349/350` at `test/demo-user-mock-repo.worker.test.ts:155`).
  - Documented `21` verified findings (`F-01`–`F-21`) in `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md` and froze baseline docs `00`–`05`.
- **Files Created/Updated:** `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md`, `notes/00-BASELINE-FREEZE-AND-INDEX.md`, `notes/01-PRODUCTION-FIX-PATCH-SPEC.md`, `notes/02-PHASED-UPDATE-ROADMAP.md`, `notes/03-PHASE-EXECUTION-LOG.md`, `notes/04-ERROR-HANDLING-INVENTORY.md`, `notes/05-ACTUAL-IMPLEMENTATION-STATUS.md` (zero application code touched).

---

### Phase 01 — Regression Fix, Production Auth & Session Security

- **Status:** `COMPLETED` (2026-11-26)
- **Target Findings:** `F-01`, `F-02`, `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08`
- **Features/Fixes Implemented & Audited:**
  - **`F-01`:** Updated `src/client/components/footer.tsx` Profile link to use `buildNamespaceProfileHref(viewer.primaryNamespaceSlug)` (`/profile/admin` for `@admin`) and scoped `<main>` assertion in `test/demo-user-mock-repo.worker.test.ts`, restoring `100%` pass across all worker tests (`58/58` files).
  - **`F-02`:** Unified canonical D1 primary-admin resolution via `resolvePrimaryAdminUser` & `resolvePrimaryAdminNamespace` in `src/worker/db/d1/dal/adminDirectory.ts` and wired it across `session.ts`, `pat.ts`, `authLogin.ts`, `systemAdmin.ts`, `index.ts`, and `ui/overview.ts`. Audited and hardened `resolvePrimaryAdminUser` so an initial D1-claimed custom handle (e.g. `@founder`) prioritizes the earliest D1 local admin when `ADMIN_PASSWORD` is unset and cannot be hijacked if a member account named `@admin` is created later.
  - **`F-03`:** Added `passwordManagedByEnv` (`resolveAdminAuthSource(env) !== "d1"`) across `Viewer`, `AccountPage.tsx`, `change-password.tsx`, `AdminUsersIsland`, `UserFormModal.tsx`, `evaluatePrimaryAdminPatchPolicy`, and `systemAdmin.ts` so D1-claimed primary admins can change/reset their password in `/user/settings/security` and `/admin/users` while remaining protected from demotion, disable, or deletion.
  - **`F-04`:** Wrapped `/auth/setup` D1 inserts (`users`, `namespaces`, `namespace_memberships`, `namespace_directory_meta`) in a single atomic `c.env.DB.batch([...])` with `WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1)` guard so partial failures never strand an incomplete user row or lock out setup.
  - **`F-05`:** Added `session_epoch` (`drizzle/d1/0002_curvy_skreet.sql`, `namespaceDirectoryMeta.ts`, `bootstrap.ts`) and sealed `sessionEpoch` inside `SessionPayloadSchema` (`session.ts`). Bumped `session_epoch` on self password change (`updateDirectoryPasswordHash` in `authLogin.ts`) and admin password reset / account disable (`upsertNamespaceDirectoryMeta` in `systemAdmin.ts`), re-sealing the active caller's cookie while immediately revoking all prior cookies (and failing closed on D1 metadata read errors).
  - **`F-06`:** Added `resolveAdminAuthSource(env)` (`"demo" | "env" | "d1"`) in `adminAuth.ts` and updated `AdminSettingsPage.tsx`, `AdminSecurityPage.tsx`, and `AccountPage.tsx` so Production D1 Auth displays `"Production D1 Auth (ADMIN_PASSWORD unset · Initial admin claimed in D1)"` and `login: <handle> (d1)` instead of misleading `ADMIN_PASSWORD set` / `(env)` labels.
  - **`F-07`:** Added synchronous isolate-local rate-limit tracking (`localRateLimitStates` + `mergeRateLimitStates`) in `src/worker/auth/rateLimit.ts` alongside KV persistence and structured warning logs on KV read/write/delete errors.
  - **`F-08`:** Added `isHttpsSessionContext` in `src/worker/auth/cookies.ts` so HTTPS requests issue `__Host-goc_session` (`Secure; SameSite=None; Partitioned`) while plain-HTTP non-HTTPS requests issue `goc_session` (`HttpOnly; SameSite=Lax; Path=/; secure: false`).
- **Scope-Locked Touch Surface Verified:** `src/client/components/footer.tsx`, `src/worker/auth/{adminAuth,session,cookies,rateLimit,pat}.ts`, `src/worker/routes/{authLogin,systemAdmin,authTokens,ui/overview}.ts`, `src/worker/index.ts`, `src/worker/db/d1/{bootstrap.ts,dal/adminDirectory.ts,schema/namespaceDirectoryMeta.ts}`, `drizzle/d1/0002_curvy_skreet.sql`, `src/shared/admin/panel.ts`, `src/client/server/viewer.ts`, `src/client/pages/{AccountPage,AdminSettingsPage,AdminSecurityPage,AuthSignInPage}.tsx`, `src/client/islands/{change-password.tsx,admin-users/*}`, `test/{admin-auth.test.ts,auth-session.worker.test.ts,auth-production-setup.worker.test.ts,demo-user-mock-repo.worker.test.ts}`. Zero out-of-scope files modified.
- **Verification Gate Proof:**
  - `npm run typecheck`: **PASS** (`0` errors)
  - `npm run test`: **PASS** (`14/14` suites, `82/82` tests)
  - `npm run test:auth`: **PASS** (`3/3` tests)
  - `npm run test:workers`: **PASS** (`58/58` worker test suites, `350/350` tests)

---

### Phase 02 — Git Protocol, Ref Backfill, Compaction & Tier Reliability

- **Status:** `COMPLETED` (2026-11-26)
- **Target Findings:** `F-09`, `F-10`, `F-17`, `F-18`, `F-19`
- **Features/Fixes Implemented & Audited:**
  - **`F-09`:** Added bounded inline `.refs` sidecar repair (`backfillPackRefsInline` in `src/worker/tasks/refBackfill.ts`, `INLINE_REF_BACKFILL_MAX_PACKS = 2`, `INLINE_REF_BACKFILL_MAX_PACK_BYTES = 8 * 1024 * 1024`) using request-scoped `getLimiter(cacheCtx)` and `countSubrequest(cacheCtx)`. Wired `loadPackRefSnapshot` in `src/worker/git/operations/fetch/plan.ts` to repair missing/corrupt/stale `.refs` sidecars inline and reload `loadPackRefView` immediately when `!hasRepoTasksQueue(env)` (Free-tier / `--no-queues`), eliminating permanent `503 Retry-After: 10` loops on incremental `git fetch` (`haves.length > 0`).
  - **`F-10`:** Added `FREE_TIER_COMPACTION_MAX_BYTES = 4 * 1024 * 1024`, `FREE_TIER_COMPACTION_MAX_OBJECTS = 2_500`, and `exceedsFreeTierCompactionBudget(env, plan)` in `src/worker/common/tier.ts`. Extended `RequestCompactionResult` (`plan.ts`) with `status: "queued" | "no_work" | "rejected"` and `reason?: "below-threshold" | "queues-required" | "free-tier-budget-exceeded"`. Updated `requestCompactionState` (`requests.ts`), `beginCompactionState`, `commitCompactionState`, `rearmCompactionQueueFromAlarm` (`lease.ts`), `finalizeReceiveState` (`receive.ts`), and `handleCompactionPost` (`admin.ts`) so queue-less deployments reject manual compaction with HTTP `409` (`queues-required`) without leaving orphaned `compactionWantedAt` flags, and Free-tier deployments enforce safe CPU budgets and alarm re-arming.
  - **`F-17`:** Updated `handleUploadPackPOST` and its JSDoc in `src/worker/routes/git.ts` to accept legacy v0/v1 `want`/`have` upload-pack fetch bodies (`!command && parseFetchArgs(body).wants.length > 0`) when `Git-Protocol: version=2` is omitted, while returning an explicit `400` (`Expected Git protocol v2 ...`) on malformed/empty non-v2 requests.
  - **`F-18`:** Updated `src/worker/routes/systemAdmin.ts` to use the request-scoped `c.var.limiter` instead of standalone `getLimiter()`, bounded cold DO branch lookups by remaining request subrequest headroom (`COLD_BRANCH_SUBREQUEST_HEADROOM = 100`) with `countSubrequest(c.var.cacheCtx, 1)`, marked unresolved cold-overflow repos with `"..."` (`UNRESOLVED_COLD_BRANCH_PLACEHOLDER`) instead of fabricating `"main"`, and added bounded background KV warming.
  - **`F-19`:** Updated `src/worker/git/receive/streamReceivePack.ts` to `await runRepoStateChange(...)` before emitting `reportStatus` in both sideband and plain receive modes, and hardened `onRepoStateChanged` in `src/worker/routes/git.ts` so `deleteRepoBranchCacheRecord` and `cacheDeleteJSON` always execute via `Promise.allSettled` even if D1 `touchRepositoryUpdatedAt` fails transiently (with `dispatchRouteCacheSync` retry fallback on D1 error).
- **Scope-Locked Touch Surface Verified:** `src/worker/common/tier.ts`, `src/worker/tasks/refBackfill.ts`, `src/worker/git/operations/fetch/plan.ts`, `src/worker/do/repo/catalog/compaction/{plan,requests,lease}.ts`, `src/worker/do/repo/catalog/receive.ts`, `src/worker/routes/{admin,git,systemAdmin}.ts`, `src/worker/git/receive/streamReceivePack.ts`, `test/{fetch-streaming.worker.test.ts,streaming-compaction.worker.test.ts,cloudflare-tier.node-test.ts}`, `notes/*.md`. Zero out-of-scope files modified.
- **Verification Gate Proof:**
  - `npm run typecheck`: **PASS** (`0` errors)
  - `npm run test`: **PASS** (`14/14` suites, `82/82` tests)
  - `npx tsx --test test/cloudflare-tier.node-test.ts`: **PASS** (`5/5` subtests)
  - Targeted Worker tests (`fetch-streaming`, `streaming-compaction`, `alarm-cleanup`, `streaming-receive`, `info-refs`): **PASS** (`5/5` suites, `51/51` tests)

---

### Phase 03 — Real Repo Metadata, Branding Defaults & Web Git Editing

- **Status:** `COMPLETED` (2026-11-26)
- **Target Findings:** `F-11`, `F-12`, `F-16`
- **Features/Fixes Implemented & Audited:**
  - **`F-11`:** Added real Git-tree/KV-cached repository metadata derivation (`src/shared/git/repoMetadata.ts` + `src/worker/repositories/repoMetadata.ts` wired into `src/worker/index.ts` and `src/worker/routes/git.ts`) replacing slug-regex language guesses in `src/client/islands/home-repos.tsx`, removed hardcoded dummy `TypeScript`/`Python` options when no languages exist, removed hardcoded `"Official open-source repository published by Vib Tools."` fallback, and neutralised `DEFAULT_SITE_BRANDING` (`src/shared/branding.ts`) + admin placeholder copy (`src/client/islands/admin-settings.tsx`).
  - **`F-12`:** Added D1 `commit_email` column (`drizzle/d1/0003_chief_stellaris.sql`, `namespaceDirectoryMeta.ts`, `bootstrap.ts`, `adminDirectory.ts`) + `/user/profile` & `PUT /auth/api/profile` UI/API (`profile-settings.tsx`, `AccountPage.tsx`, `viewer.ts`, `authTokens.ts`, `authLogin.ts`, `requestSchemas.ts`), eliminating hardcoded `${slug}@local.dev` web commit emails (`users.noreply.*` fallback when blank). Extended `src/worker/git/commitFile.ts` (`commitRepositoryMutation`) with `delete` (auto-pruning empty parent trees) and `move` (preserving file mode) + `Uint8Array` binary payload support, added `POST /auth/api/repositories/:id/file/upload`, `DELETE .../file`, and `POST .../file/move` (`authRepositories.ts`), added `POST`/`DELETE /:owner/:repo/admin/refs` (`admin.ts`), and wired UI in `OverviewPage.tsx`, `TreePage.tsx`, `BlobPage.tsx`, `repo-overview-actions.tsx`, `blob-editor.tsx`, and `tree-page.ts`.
  - **`F-16`:** Added `src/shared/web/rawHotlink.ts` (`isRawPathRequestAllowed`) wired into `src/worker/routes/ui/raw.ts`, allowing `Sec-Fetch-Site: none` / `same-origin` and matching `X-Forwarded-Host` / `Host` `Referer` requests while still returning `403` on explicit `Sec-Fetch-Site: cross-site`, foreign `Referer`/`Origin`, or bare hotlink probes.
- **Scope-Locked Touch Surface Verified:** `drizzle/d1/0003_chief_stellaris.sql`, `drizzle/d1/meta/_journal.json`, `drizzle/d1/meta/0003_snapshot.json`, `src/shared/{branding.ts,git/repoMetadata.ts,web/rawHotlink.ts}`, `src/worker/db/d1/{bootstrap.ts,dal/adminDirectory.ts,schema/namespaceDirectoryMeta.ts}`, `src/worker/repositories/repoMetadata.ts`, `src/worker/git/commitFile.ts`, `src/worker/routes/{admin,authLogin,authRepositories,authTokens,git,requestSchemas,ui/raw}.ts`, `src/worker/index.ts`, `src/client/{entries/tree-page.ts,server/viewer.ts,pages/{AccountPage,BlobPage,OverviewPage,TreePage}.tsx,islands/{admin-settings,blob-editor,home-repos,profile-settings,repo-overview-actions}.tsx}`, `test/{phase03-logic.test.ts,phase03-web-git.worker.test.ts,d1-schema.worker.test.ts,github-feel.worker.test.ts,system-admin.worker.test.ts,phase04-logic.node-test.ts}`, `notes/*.md`. Zero Phase 04/05 files touched (`app.css`, `Toast`, `PWA`, deploy scripts).
- **Verification Gate Proof:**
  - `npm run typecheck`: **PASS** (`0` errors)
  - `npm run build` (`compile_applet`): **PASS**
  - `npm run test`: **PASS** (`15/15` suites, `86/86` tests)
  - `npx --yes tsx --test test/phase04-logic.node-test.ts test/cf-auto-deploy.node-test.ts test/cloudflare-tier.node-test.ts`: **PASS** (`24/24` tests)
  - `npm run test:workers`: **PASS** (`59/59` worker test suites, `356/356` tests)
  - Live Browser (`playwright-cli` on `http://localhost:3000`): Verified `/` anonymous hero/language dropdown, `/user/profile` `#profile-commit-email`, `/alex-dev/cloud-forge-kit` `Add file`/`New folder`/`Upload file`/`New ref`, `/alex-dev/cloud-forge-kit/blob` `Edit file`/`Rename / Move`/`Delete file` (`0` console errors).

---

### Phase 04 — Component-Only UI System (`--radius: 0rem`), Global Toast & PWA

- **Status:** `COMPLETED` (2026-11-26)
- **Target Findings:** `F-13`, `F-14`, `F-15`
- **Features/Fixes Implemented & Audited:**
  - **`F-13`:** Added `src/shared/toast.ts` + `src/client/components/ui/toast.tsx` (`ToastProvider`, `ToastViewport`, `mountGlobalToastViewport`, `showToast`, `copyToClipboard`) mounted globally via `src/client/entries/shell.ts`. Replaced all silent clipboard catches / `console.warn` (`home-repos.tsx`, `blob-actions.tsx`, `RepositoriesSection.tsx`, `TokensSection.tsx`), removed forced `window.location.reload()` timers in `useRepoAdminActions.ts` (replacing with toast + optional refresh action), and wired structured success/error toasts across `tokens.tsx`, `admin-settings.tsx`, `admin-users/*`, `system-admin/*`, `profile-settings.tsx`, `change-password.tsx`, `owner-profile.tsx`, `profile-readme-editor.tsx`, `repositories.tsx`, `blob-editor.tsx`, `repo-overview-actions.tsx`, and `header-menus.tsx`.
  - **`F-14`:** Added `src/shared/pwa.ts`, `/public/manifest.webmanifest` (with separate `192x192` `any`, `512x512` `any`, `512x512` `maskable`, and SVG icons), `/public/sw.js` (network-first navigation, SWR static `/assets/` & `/icons/`, strict bypass for `/auth`, `/admin`, `/user/*`, `/api/*`, `/sw.js`, HMR, mutations, and Git Smart HTTP routes), `/public/icons/{icon-192.png,icon-512.png,icon-maskable-512.png,icon.svg}`, `/public/apple-touch-icon.png` (`180x180`), SSR head tags in `src/client/server/document.tsx`, and `PwaInstallControl` (`src/client/components/ui/pwa-install.tsx`) + SW registration in `src/client/entries/shell.ts` and `src/client/components/footer.tsx`.
  - **`F-15`:** Set `--radius: 0rem;` and zeroed all `--radius-*` CSS tokens in `src/client/styles/app.css`, enforced exact `"Segoe UI", "Segoe UI Web", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;` stack in `app.css` and `src/client/server/error.ts`, eliminated non-zero `rounded-*` and `shadow-*` utility classes across `ui/*`, `components/*`, `pages/*`, `islands/*`, and SSR error fallback (preserving only semantic 8px `rounded-full` language dots in `home-repos.tsx` and `.diff-spinner`), and unified raw buttons/inputs/textareas/selects/alerts onto `@/client/components/ui`.
- **Scope-Locked Touch Surface Verified:** `public/{manifest.webmanifest,sw.js,apple-touch-icon.png,icons/*}`, `src/shared/{pwa.ts,toast.ts}`, `src/client/styles/app.css`, `src/client/entries/shell.ts`, `src/client/server/{document.tsx,error.ts}`, `src/client/components/*`, `src/client/pages/*`, `src/client/islands/*`, `test/{phase04-ui-pwa.node-test.ts,phase04-pwa-ui.worker.test.ts}`, `notes/*.md`. Zero Worker/DO/Git/D1/deploy files touched (`/public/assets/aistudio/` preserved untouched for Phase 05).
- **Verification Gate Proof:**
  - `npm run typecheck`: **PASS** (`0` errors)
  - `npm run build` (`compile_applet`): **PASS**
  - `npm run test`: **PASS** (`15/15` suites, `86/86` tests)
  - `npx --yes tsx --test test/phase04-ui-pwa.node-test.ts`: **PASS** (`4/4` tests)
  - `npm run test:workers`: **PASS** (`60/60` worker test suites, `357/357` tests including `test/phase04-pwa-ui.worker.test.ts`)
  - Live Browser (`playwright-cli` on `http://localhost:3000`): Verified `/manifest.webmanifest` (`200`), `/sw.js` (`200`), icons (`200`), Segoe/Helvetica font stack, `0px` radius & `none` box-shadow on UI controls, circular `8x8` TypeScript dot, live clipboard fallback toast rendering (`1440x900` & `390x844`), zero mobile horizontal overflow, and `0` console errors.

---

### Phase 05 — Auto-Deploy Secret Hygiene, Bundle Cleanup & Formatting

- **Status:** `COMPLETED` (2026-11-26)
- **Target Findings:** `F-20`, `F-21`
- **Features/Fixes Implemented & Audited:**
  - **`F-20`:** Reduced `REQUIRED_WORKER_SECRETS` in `scripts/cf-auto-deploy-lib.mjs` to `["SESSION_SECRET"]` (removing unused `CREDENTIAL_SECRET` and `ADMIN_BOOTSTRAP_SECRET`), added `buildSecretsUploadPayload` (strictly omitting `"keep"` secrets) and `buildWranglerDeployArgs`, and updated `scripts/cf-auto-deploy.mjs` so secret discovery and `planSecretReconciliation` run **before** `wrangler deploy`, passing only pending `"create"` / `"rotate"` secrets atomically via ephemeral `.wrangler/deploy.secrets.json` (`mode: 0o600`, `--secrets-file`, guaranteed removal in `finally`).
  - **`F-21`:** Deleted all 22 unreferenced files under `/public/assets/aistudio/` so `vite build` omits them from `dist/client/assets/aistudio`, added a `*.jsonc` (`trailingComma: "none"`) override in `.prettierrc` so Prettier-formatted `wrangler.paid.jsonc` parses cleanly under strict JSON comment-stripping, and ran `npm run format` so `npm run format:check` passes with `0` issues across the repository.
- **Scope-Locked Touch Surface Verified:** `scripts/cf-auto-deploy-lib.mjs`, `scripts/cf-auto-deploy.mjs`, `test/cf-auto-deploy.node-test.ts`, `.prettierrc`, `wrangler.paid.jsonc`, removal of `/public/assets/aistudio/`, Prettier formatting across repo, `notes/*.md`. Zero runtime Worker/DO/UI feature code altered.
- **Verification Gate Proof:**
  - `npm run format:check`: **PASS** (`All matched files use Prettier code style!`)
  - `node --test test/cf-auto-deploy.node-test.ts`: **PASS** (`10/10` tests)
  - `npm run cf:auto-deploy -- --dry-run`: **PASS**
  - `npx --yes tsx --test test/cloudflare-tier.node-test.ts test/phase04-ui-pwa.node-test.ts`: **PASS** (`10/10` tests)
  - `npm run typecheck`: **PASS** (`0` errors)
  - `npm run test`: **PASS** (`15/15` suites, `86/86` tests)
  - `npm run build` (`compile_applet`): **PASS** (zero `dist/client/assets/aistudio`)
  - Targeted Worker suites (`phase04-pwa-ui`, `auth-production-setup`, `system-admin`): **PASS** (`3/3` suites, `12/12` tests; `src/worker/` runtime unchanged from full `60/60`, `357/357` pass)
