# 01 · Production Fix Patch Specification (Code Proof & Scope Locks)

Every patch specification below maps **1:1** to verified findings `F-01` through `F-21` from `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md`.  
**Execution Rule:** No code is changed until explicitly starting each phase; every phase strictly honors its **Scope Lock**.

---

## Phase 01 — Regression Fix, Production Auth & Session Security (`F-01`–`F-08`)

### Scope Lock (`Phase 01`)
- **Allowed Paths:** `src/client/components/footer.tsx`, `src/worker/auth/{adminAuth,session,cookies,rateLimit}.ts`, `src/worker/routes/{authLogin,systemAdmin,ui/overview}.ts`, `src/worker/index.ts` (primary admin lookup lines only), `src/worker/db/d1/*`, `drizzle/d1/*`, `src/client/pages/{AccountPage,AdminSettingsPage,AdminSecurityPage}.tsx`, `src/client/islands/change-password.tsx`, `src/client/islands/admin-users/{index,UserFormModal}.tsx`, `test/auth*.ts`, `test/admin-auth*.ts`, `test/demo-user-mock-repo.worker.test.ts`.
- **Forbidden Outside Scope:** Do NOT alter Git protocol/pack/compaction (`src/worker/git/`, `src/worker/do/`), homepage metadata (`home-repos.tsx`), CSS tokens, PWA, or `scripts/cf-auto-deploy*.mjs`.

### Patch Specs (`F-01`–`F-08`)

1. **`F-01` Footer Profile Route Collision & Worker Test Failure**
   - **Target:** `src/client/components/footer.tsx:108-114`
   - **Current Code:**
     ```tsx
     <a href={`/${viewer.primaryNamespaceSlug}`} className={LINK_CLASS}>
       Profile
     </a>
     ```
   - **Required Patch:** Import `buildNamespaceProfileHref` from `@/shared/admin/panel` and use `href={buildNamespaceProfileHref(viewer.primaryNamespaceSlug)}` (so `@admin` routes to `/profile/admin`, matching `AdminSettingsPage.tsx:87` & `AccountPage.tsx:254`, and `<footer ...>` stops emitting `href="/admin"` for Profile). Also verify `test/demo-user-mock-repo.worker.test.ts:150-155` scopes assertions to `<main>` cleanly or confirm both fixes pass `npm run test:workers`.

2. **`F-02` Production `/auth/setup` Primary-Admin Subject Mismatch**
   - **Target:** `src/worker/routes/authLogin.ts:617-622`, `src/worker/auth/session.ts:236-238`, `src/worker/routes/systemAdmin.ts:81-85,799`, `src/worker/index.ts:84-87,182-185,235-238`, `src/worker/routes/ui/overview.ts:112,189-195`
   - **Current Code (`authLogin.ts:617` vs `session.ts:236-238`):**
     ```ts
     // setup:
     const subject = buildLocalAccountSubject(handleCheck.slug);
     // session check:
     const primaryAdminSubject = buildLocalAccountSubject(authConfig.username);
     const isPrimaryAdmin = active.user.tesseraSub === primaryAdminSubject;
     ```
   - **Required Patch:** Store/resolve an explicit canonical primary-admin role/flag in D1 (`users` or `directory_meta` / deterministic first claimed admin lookup when `authConfig.password === null`), OR unify `resolvePrimaryAdminAccount(db, env)` into one shared helper in `src/worker/auth/` and `src/worker/db/d1/dal` so `/auth/setup` with custom handle (e.g. `@founder`) is recognized consistently across `session.ts`, `systemAdmin.ts`, `index.ts`, and `ui/overview.ts`.

3. **`F-03` D1 Primary-Admin Password Change & Admin Reset UI Block**
   - **Target:** `src/client/islands/change-password.tsx:53-67`, `src/client/pages/AccountPage.tsx:229-230`, `src/client/islands/admin-users/UserFormModal.tsx:63,110,161,254-263,359`, `src/worker/routes/authTokens.ts:59-72`, `src/worker/routes/systemAdmin.ts:231-250,478-487`
   - **Current Code (`change-password.tsx:53`):**
     ```tsx
     if (isPrimaryAdmin) { return <div>Managed by environment configuration</div>; }
     ```
   - **Required Patch:** Pass explicit boolean `passwordManagedByEnv` (`resolveAdminAuthConfig(env).password !== null`) in viewer/admin props. Lock password change UI ONLY when `isPrimaryAdmin && passwordManagedByEnv`; allow D1-claimed primary admin to change password in `/user/settings/security` and manage via `/admin/users` (while still blocking demote/disable/delete in `evaluatePrimaryAdminPatchPolicy`).

4. **`F-04` Non-Transactional `/auth/setup` Partial Failure Lockout**
   - **Target:** `src/worker/routes/authLogin.ts:618-652`
   - **Required Patch:** Wrap user creation, namespace claim, membership insert, and directory metadata upsert via `c.env.DB.batch([...])` or add compensating cleanup on throw so partial failure leaves `users` clean and `/auth/setup` retryable.

5. **`F-05` Session Revocation After Password Change or Reset**
   - **Target:** `src/worker/auth/session.ts:26-31,183-188,198-206`, `src/worker/routes/authLogin.ts:482-484`, `src/worker/routes/systemAdmin.ts:501`
   - **Required Patch:** Add integer `sessionEpoch` (or `passwordUpdatedAt` / `tokenVersion` column in D1 `directory_meta` or `users`, defaulting to `1`) into `SessionPayloadSchema` (`session.ts:26-31`), compare during `readActiveSessionUncached`, and bump on password change (`authLogin.ts:483`) and admin password reset (`systemAdmin.ts:501`) + update `Set-Cookie` on self password change.

6. **`F-06` False `"ADMIN_PASSWORD set"` / `"(env)"` Status Labels**
   - **Target:** `src/worker/auth/adminAuth.ts:41-45,153-158`, `src/worker/routes/systemAdmin.ts:709,739,769,841,886`, `src/client/pages/AdminSettingsPage.tsx:66,79,103-107`, `src/client/pages/AdminSecurityPage.tsx:138`, `src/client/pages/AccountPage.tsx:229-230`
   - **Required Patch:** Distinguish `mode: "demo" | "d1" | "env"` (or pass `passwordSource: "env" | "d1" | "demo"` cleanly alongside `mode`) so Production without `ADMIN_PASSWORD` displays `D1 Admin Auth (Setup claimed · Demo Login disabled)` instead of `ADMIN_PASSWORD set` / `(env)`.

7. **`F-07` Non-Atomic & Fail-Open KV Rate Limiting**
   - **Target:** `src/worker/auth/rateLimit.ts:119-153`
   - **Required Patch:** Add an in-memory isolate fallback rate-limiter map (defense-in-depth during concurrent requests / KV blips) plus stricter fail-closed/degraded handling when `ROUTES` throws on `checkAuthRateLimit` (with structured log visibility).

8. **`F-08` Plain-HTTP Session Cookies on Non-Localhost Hosts**
   - **Target:** `src/worker/auth/cookies.ts:11-38`, `src/worker/auth/origin.ts`
   - **Current Code (`cookies.ts:17-23`):**
     ```ts
     const SHARED_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "None", partitioned: true, prefix: "host" };
     ```
   - **Required Patch:** Derive request security dynamically from `isSecureRequest(c)` (`url.protocol === "https:"` or `x-forwarded-proto === "https"`): use `__Host-` + `Secure; SameSite=None; Partitioned` on HTTPS, and fall back to `goc_session` (`Path=/; HttpOnly; SameSite=Lax; secure: false`) on plain HTTP (`http://192.168.x.x` / local IP) so self-hosted HTTP works without breaking iframe HTTPS preview.

---

## Phase 02 — Background Queues, Compaction, Tier Policy & Git Engine (`F-09`, `F-10`, `F-17`–`F-19`)

### Scope Lock (`Phase 02`)
- **Allowed Paths:** `src/worker/git/operations/fetch/plan.ts`, `src/worker/tasks/{dispatch,packRefBackfill,compaction,queue}.ts`, `src/worker/routes/{admin,git,systemAdmin}.ts`, `src/worker/do/repo/catalog/compaction/{requests,lease,plan}.ts`, `src/worker/common/tier.ts`, related worker unit/integration tests (`test/*.worker.test.ts`, `test/pack-ref-index.test.ts`).
- **Forbidden Outside Scope:** Do NOT alter auth login/session files (`src/worker/auth/`), client UI styles/pages (`src/client/components/ui/`), or deploy scripts.

### Patch Specs (`F-09`, `F-10`, `F-17`–`F-19`)

1. **`F-09` `.refs` Backfill Deadlock Without Queue Binding**
   - **Target:** `src/worker/git/operations/fetch/plan.ts:132-139,185-188`, `src/worker/tasks/dispatch.ts:113-132`, `src/worker/tasks/refBackfill.ts`
   - **Required Patch:** When `!hasRepoTasksQueue(env)`, run a bounded inline single-pack `.refs` backfill (or fallback closure via sidecar/inline execution guarded by `limiter`) so incremental `git fetch` (`haves.length > 0`) recovers cleanly instead of returning infinite `503 Retry-After: 10`.

2. **`F-10` Manual Compaction Stuck `"queued"` & Free-Tier Hazard**
   - **Target:** `src/worker/routes/admin.ts:69-96`, `src/worker/do/repo/catalog/compaction/requests.ts:103-122`, `src/worker/do/repo/catalog/compaction/lease.ts:285-289`, `src/worker/common/tier.ts:44-46`
   - **Required Patch:**
     - If `!hasRepoTasksQueue(env)`, reject manual compaction cleanly with explicit `409` / `501` (`reason: "queues-required"`) or execute bounded small-repo compaction inline without writing permanent orphan `compactionWantedAt`.
     - If `hasRepoTasksQueue(env)` on `CLOUDFLARE_TIER=free`, gate heavy pack rewrites explicitly by pack/object byte budget (or require explicit force / return clear tier warning) AND allow `rearmCompactionQueueFromAlarm` when `compactionWantedAt` was manually requested (`wantedAt` explicitly admin-initiated) so queued manual compaction never deadlocks.

3. **`F-17` Legacy Git Smart HTTP v0/v1 Clients Rejected**
   - **Target:** `src/worker/routes/git.ts:95-117`
   - **Required Patch:** Either implement minimal v0/v1 `want`/`have` upload-pack body translation in `handleUploadPackPOST` when `Git-Protocol: version=2` is omitted, OR update `/info/refs` & `handleUploadPackPOST` error + comments cleanly with an explicit documented protocol error & client upgrade guidance (removing contradictory JSDoc claiming legacy support).

4. **`F-18` `systemAdmin.ts` 60-Repo Cold Branch Cap & Standalone Limiter**
   - **Target:** `src/worker/routes/systemAdmin.ts:79,169-173,271`
   - **Required Patch:** Pass `c.var.limiter` instead of standalone `getLimiter()` on line `271`; respect subrequest headroom dynamically or paginate/mark unresolved overflow (`"..."` / lazy resolve) instead of silently faking `"main"` for repo #61+.

5. **`F-19` Non-Atomic `waitUntil` Post-Push Cache & `updatedAt` Sync**
   - **Target:** `src/worker/routes/git.ts:221-247`, `src/worker/git/receive/streamReceivePack.ts:80-90`
   - **Required Patch:** Await `touchRepositoryUpdatedAt` + KV branch/refs cache purge before returning `receive-pack` completion (or immediately purge on error fallback + retry via `enqueueRouteCacheSync`) so pushed refs never serve stale `updatedAt` keys.

---

## Phase 03 — Real Repo Metadata, Branding Defaults & Web Git Editing (`F-11`, `F-12`, `F-16`)

### Scope Lock (`Phase 03`)
- **Allowed Paths:** `src/client/islands/home-repos.tsx`, `src/shared/branding.ts`, `src/worker/index.ts` (repo prop enrichment lines only), `src/worker/routes/{authRepositories,admin,ui/raw}.ts`, `src/worker/git/commitFile.ts`, `src/client/islands/{repo-overview-actions,blob-editor,blob-actions}.tsx`, `src/client/pages/{OverviewPage,TreePage,BlobPage}.tsx`.
- **Forbidden Outside Scope:** Do NOT alter auth, Session, compaction, or global CSS/Toast/PWA systems (Phase 04).

### Patch Specs (`F-11`, `F-12`, `F-16`)

1. **`F-11` Real Metadata, Clean Empty Filter & Generic Neutral Branding Defaults**
   - **Target:** `src/client/islands/home-repos.tsx:99-123,206-217,438-457`, `src/shared/branding.ts:28-50`, `src/worker/index.ts:99-108,158-167,195-204`
   - **Required Patch:** Derive primary repository language/topics/defaultBranch/license cleanly on server/DB (or from repository tree metadata cached in KV) instead of slug regexes; remove hardcoded `TypeScript`/`Python` dummy dropdown injection when `set.size === 0`; remove hardcoded `"Official open-source repository published by Vib Tools."` fallback; replace hardcoded Vib Tools URLs/emails in `DEFAULT_SITE_BRANDING` (`production` vs `demo`) with neutral self-hosted defaults.

2. **`F-12` Web Repo File Delete / Rename / Binary Upload / Branch-Tag UI & Configurable Author Email**
   - **Target:** `src/worker/git/commitFile.ts`, `src/worker/routes/authRepositories.ts:305,326,421,503`, `src/client/islands/repo-overview-actions.tsx`, `src/client/islands/blob-editor.tsx`
   - **Required Patch:** Extend tree mutation helper (`commitRepositoryFile` -> upsert / delete / rename + binary `Uint8Array` blob support), add `DELETE` / `POST /upload` routes under `/auth/api/repositories/:id/file`, expose UI for file upload / delete / rename and branch/tag creation/switching wired to `/:owner/:repo/admin/refs` (for repo admins), and let authenticated users configure commit email on profile instead of `${authorSlug}@local.dev`.

3. **`F-16` Raw Path Hotlink Guard Fix**
   - **Target:** `src/worker/routes/ui/raw.ts:86-98`
   - **Required Patch:** Allow same-origin requests via `Sec-Fetch-Site: same-origin | none` (direct navigation / new tab) OR matching forwarded host (`x-forwarded-host` / `url.host`), blocking only cross-site `Referer` / `Sec-Fetch-Site: cross-site` hotlinks.

---

## Phase 04 — Component-Only Design System, Global Toast & PWA (`F-13`, `F-14`, `F-15`)

### Scope Lock (`Phase 04`)
- **Allowed Paths:** `src/client/styles/app.css`, `src/client/components/ui/*`, `src/client/components/{header,footer,Sidebar,AdminSettingsLayout,UserSettingsLayout}.tsx`, `src/client/server/document.tsx`, `src/client/islands/*`, `public/` (PWA manifest, service worker, icons), `vite.config.ts`.
- **Forbidden Outside Scope:** Zero changes to Worker API logic, Git protocol, D1/DO schemas, or deploy scripts.

### Patch Specs (`F-13`, `F-14`, `F-15`)

1. **`F-13` Global Toast Notification Provider & Clipboard Feedback**
   - **Required Patch:** Create global `<ToastProvider />` + `showToast({ tone, title, message })` in `src/client/components/ui/toast.tsx` (mounted via shell), replace all silent clipboard `catch {}` (`home-repos.tsx:325`, `RepositoriesSection.tsx:247`, `TokensSection.tsx:112`, `blob-actions.tsx:33`) and raw `window.location.reload()` timers (`useRepoAdminActions.ts:59-61`) with unified original API error/success toasts.

2. **`F-14` Full PWA Installability Support**
   - **Target:** `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, `src/client/server/document.tsx:45-83`, `src/client/entries/shell.ts`
   - **Required Patch:** Add real Web App Manifest (`manifest.webmanifest`), static SVG/PNG install icons, offline-first navigation/static-asset Service Worker (`sw.js`), `<link rel="manifest">`, `theme-color`, `apple-touch-icon`, and service worker registration in `shell.ts`.

3. **`F-15` Flat Zero-Radius (`--radius: 0rem`) Design Tokens & Single-Source UI Primitives**
   - **Target:** `src/client/styles/app.css:11,13`, `src/client/components/ui/{button,card,input,badge,confirm-modal}.tsx`, all islands bypassing `ui/*`
   - **Required Patch:** Set exact font stack `"Segoe UI", "Segoe UI Web", system-ui, -apple-system, "Helvetica Neue", sans-serif`; enforce `--radius: 0rem` (replace `rounded-md` / `rounded` / `rounded-full` & `shadow-lg` on global UI primitives, keeping only 1 subtle border token and 2 accent tokens light+dark); migrate inline custom buttons/inputs/modals across islands to `@/client/components/ui`.

---

## Phase 05 — Deploy Pipeline, Secret Hygiene & Bundle Cleanup (`F-20`, `F-21`)

### Scope Lock (`Phase 05`)
- **Allowed Paths:** `scripts/cf-auto-deploy-lib.mjs`, `scripts/cf-auto-deploy.mjs`, `test/cf-auto-deploy.node-test.ts`, `wrangler.paid.jsonc`, `public/assets/aistudio/` (removal), `package.json` (only if script cleanup strictly needed).
- **Forbidden Outside Scope:** Zero edits to application runtime `src/`.

### Patch Specs (`F-20`, `F-21`)

1. **`F-20` Deploy Ordering & Unused Secrets Cleanup**
   - **Target:** `scripts/cf-auto-deploy-lib.mjs:11-15`, `scripts/cf-auto-deploy.mjs:476-511`, `test/cf-auto-deploy.node-test.ts`
   - **Required Patch:** Reduce `REQUIRED_WORKER_SECRETS` to active runtime secrets (`["SESSION_SECRET"]`, removing unused `CREDENTIAL_SECRET` & `ADMIN_BOOTSTRAP_SECRET` — or clarify migration), and run secret reconciliation **before** (or cleanly verified prior to public routing of) `wrangler deploy` so new deployments never boot without `SESSION_SECRET`.

2. **`F-21` Remove Unreferenced `/public/assets/aistudio/` & Fix Prettier Baseline**
   - **Target:** `/public/assets/aistudio/` (`22` unreferenced files), `wrangler.paid.jsonc`
   - **Required Patch:** Remove unreferenced AI Studio design artifacts from `public/assets/aistudio/` so they are not copied into Production `dist/client`, format `wrangler.paid.jsonc`, and verify `npm run format:check` exits `0`.
