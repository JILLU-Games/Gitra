# Production Forensic Audit Report (`git-on-cloudflare` / Gitra)

**Audit Type:** Deep Source-Code & Live-Verification Forensic Audit (Read-Only Assessment)  
**Scope:** End-to-End Production Readiness, Demo Mode vs. Production Mode Parity, UI vs. Backend Reality, Auth/RBAC/Security, Git/DO/R2/D1/KV/Queue Engines, Build/Test/Deploy Automation  
**Ground Rules Enforced:** 100% verified directly from live source files (`src/`, `scripts/`, `test/`, `wrangler*.jsonc`, `vite.config.ts`, `package.json`, `public/`) and executed build/lint/test commands. Existing documentation and `.md` notes were **not** used as evidence.

---

## 1. Executive Summary

- **Total Verified Findings:** **21** (`2 Critical`, `7 High`, `11 Medium`, `1 Low`)
- **Live Verification Baseline on Clean Checkout:**
  - `npm run typecheck`: **PASSED**
  - `npm run build`: **PASSED**
  - `npm run test` (Vitest unit suite): **PASSED** (`14` test files, `75` tests)
  - `node --test test/cf-auto-deploy.node-test.ts`: **PASSED** (`8` subtests, `8` pass)
  - `npm run format:check` (`prettier --check .`): **FAILED** (`2` files unformatted: `public/assets/aistudio/VIB_TOOLS_COMPANY_AUTHOR_MASTER_CONTEXT_528b6a24.md`, `wrangler.paid.jsonc`)
  - `npm run test:workers` (Cloudflare `workerd` integration suite): **FAILED** (`57` passed / `1` failed test files; `349` passed / `1` failed tests — failure at `test/demo-user-mock-repo.worker.test.ts:155`)

### High-Level Verdict

Core Git Smart HTTP v2 (`ls-refs`, streaming `fetch`, streaming `receive-pack`, R2 pack/index storage, Repo Durable Object SQLite/lease state), PAT scoping, D1 CRUD for users/namespaces/repositories/branding, and single-file text commits work genuinely against Cloudflare bindings. However, the application is **not cleanly production-ready** due to:

1. A broken `footer.tsx` Profile link that collides with `/admin` and breaks the worker test suite (`F-01`);
2. Production first-run `/auth/setup` & primary-admin password/label bugs when `ADMIN_PASSWORD` is unset (`F-02`, `F-03`, `F-04`, `F-05`, `F-06`);
3. Incremental `git fetch` (`503`) and manual pack compaction (`"queued"` deadlock / Free-tier CPU mismatch) failures when `REPO_TASKS_QUEUE` is unbound or `CLOUDFLARE_TIER=free` (`F-09`, `F-10`);
4. UI/UX gaps where repository languages/filters are fake client-side regex guesses, hardcoded `"Vib Tools"` copy leaks into uncustomized instances, there is zero Toast feedback or PWA support, and UI islands bypass global UI design tokens (`F-11`–`F-15`);
5. Legacy Git v0/v1 client rejection, deployment secret ordering & unused secret provisioning, and unreferenced asset bloat (`F-17`, `F-20`, `F-21`).

---

## 2. Demo Mode vs. Production Mode Feature Parity Matrix

| Capability / Area                                                  | Dev / Demo Mode (`!import.meta.env.PROD` & `ADMIN_PASSWORD` unset & `AUTH_MODE!=production`) | Production Mode (`import.meta.env.PROD` or `AUTH_MODE=production` or `ADMIN_PASSWORD` set)                  | Code Proof                                                                                        |
| :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **Quick Demo Login (`POST /auth/demo-login`) & UI Card**           | Active (one-click `admin` & `alex-dev` sign-in; Demo credentials shown)                      | Strictly disabled (compile-time & runtime `403`, UI card stripped)                                          | `src/worker/routes/authLogin.ts:680-683`, `src/client/pages/AuthSignInPage.tsx:48,178-220`        |
| **Auto-Seeded Showcase Workspace (`demoSeed.ts`)**                 | Active (`admin` + `alex-dev`, seeded repos/READMEs on entry)                                 | Strictly disabled (`ensureDemoWorkspaceOnPublicEntry` returns early)                                        | `src/worker/index.ts:62-79,174-177,225-228`, `src/worker/auth/adminAuth.ts:168-173`               |
| **First-Run D1 Admin Claim (`/auth/setup`)**                       | Disabled                                                                                     | Active when `ADMIN_PASSWORD` unset & D1 `users` table empty; **buggy if chosen handle != `ADMIN_USERNAME`** | `src/worker/routes/authLogin.ts:561-667` (`F-02`, `F-04`)                                         |
| **Primary Admin Self-Password Change (`/user/settings/security`)** | Disabled (`Env / Demo config`)                                                               | **Blocked in UI even when D1-claimed (`ADMIN_PASSWORD` unset)** despite backend supporting it               | `src/worker/routes/authLogin.ts:434-436`, `src/client/islands/change-password.tsx:53-67` (`F-03`) |
| **Admin Mode & Security Status Labels**                            | Correctly shows Demo Mode                                                                    | **Falsely reports `"ADMIN_PASSWORD set"` and `login: admin (env)` when using D1 password**                  | `src/worker/auth/adminAuth.ts:153-158`, `src/client/pages/AdminSettingsPage.tsx:103-107` (`F-06`) |
| **Session Secret Policy**                                          | Ephemeral per-isolate random fallback if `SESSION_SECRET` unset                              | Strict fail-closed if `SESSION_SECRET` missing/blank/dev-placeholder                                        | `src/worker/auth/session.ts:153-171`                                                              |
| **Site Branding & Copy (`/admin/settings`)**                       | Pre-populated defaults (`gitra` / `Vib Tools`)                                               | **Defaults still emit hardcoded `"Vib Tools"` / `"gitra"` descriptions & external links until edited**      | `src/shared/branding.ts:28-50`, `src/client/islands/home-repos.tsx:438-440` (`F-11`)              |
| **Git Smart HTTP v2 (Clone, Fetch, Push)**                         | Real Worker + DO + R2 + PAT                                                                  | Real Worker + DO + R2 + PAT (**incremental fetch breaks if `REPO_TASKS_QUEUE` unbound**)                    | `src/worker/routes/git.ts:99-248`, `src/worker/git/operations/fetch/plan.ts:185-188` (`F-09`)     |
| **User / Namespace / PAT / Repo CRUD**                             | Real D1 + DO + R2 (seeded initially)                                                         | Real D1 + DO + R2 (starts empty; footer `Profile` link collides with `/admin` if slug is `admin`)           | `src/client/components/footer.tsx:108-114` (`F-01`)                                               |
| **Background Pack Compaction & `.refs` Backfill**                  | Works only if Queue bound & paid config; dead under `--no-queues`                            | **Stucks `"queued"` under `--no-queues`; Free tier risks Error 1102 / alarm re-arm stall**                  | `src/worker/routes/admin.ts:69-96`, `src/worker/common/tier.ts:44-46` (`F-09`, `F-10`)            |

---

## 3. Complete Forensic Findings Inventory

### Group A — Broken Functionality, Test Failure & Auth/Security Bugs

#### `F-01` [Critical] Footer `Profile` link points to `/${slug}` instead of `/profile/${slug}`, colliding with `/admin` and failing `npm run test:workers`

- **Evidence:**
  - `src/worker/routes/ui.ts:11-12`:
    ```ts
    // Explicit profile route (prevents /admin control panel collision for @admin)
    router.get(`/profile/:owner`, handleOwnerOverview);
    ```
  - `src/client/components/footer.tsx:108-114`:
    ```tsx
    {
      viewer.primaryNamespaceSlug ? (
        <li>
          <a href={`/${viewer.primaryNamespaceSlug}`} className={LINK_CLASS}>
            Profile
          </a>
        </li>
      ) : null;
    }
    ```
  - `test/demo-user-mock-repo.worker.test.ts:150-155` (live `npm run test:workers` failure):
    ```ts
    const adminMainHtml = adminProfileHtml.split("<main")[1] ?? adminProfileHtml;
    ...
    expect(adminMainHtml).not.toContain('href="/admin"');
    ```
- **Root Cause & Impact:** Unlike `AccountPage.tsx:254`, `AdminSettingsPage.tsx:87`, and `AdminSecurityPage.tsx:128` (which use `/profile/:owner`), `footer.tsx` links `Profile` directly to `/${viewer.primaryNamespaceSlug}`. When the primary admin's handle is `admin` (default in Demo Mode and whenever `ADMIN_USERNAME` defaults to `admin`), the footer `Profile` link navigates to the Site Administration panel (`/admin`) instead of their profile (`/profile/admin`). Furthermore, because `<footer>` appears after `<main>` in the rendered HTML, `test/demo-user-mock-repo.worker.test.ts:155` fails on clean checkout (`1 failed` in `npm run test:workers`).

---

#### `F-02` [Critical] Production first-run `/auth/setup` creates user under chosen handle while Primary-Admin checks hardcode `ADMIN_USERNAME`

- **Evidence:**
  - `src/worker/routes/authLogin.ts:617-622`:
    ```ts
    const subject = buildLocalAccountSubject(handleCheck.slug);
    const user = await insertUserIfNew(db, {
      id: generateUserId(),
      tesseraSub: subject,
      createdAt: now,
    });
    ```
  - `src/worker/auth/session.ts:236-238`:
    ```ts
    const authConfig = resolveAdminAuthConfig(c.env);
    const primaryAdminSubject = buildLocalAccountSubject(authConfig.username);
    const isPrimaryAdmin = active.user.tesseraSub === primaryAdminSubject;
    ```
  - Same hardcoded `resolveAdminAuthConfig(...).username` lookup in:
    - `src/worker/routes/systemAdmin.ts:81-85, 799` (`resolvePrimaryAdminNamespaceId`, `GET /admin/users` `primaryNamespaceSlug`)
    - `src/worker/index.ts:84-87, 182-185, 235-238`
    - `src/worker/routes/ui/overview.ts:112, 189-195`
- **Root Cause & Impact:** If an operator runs `/auth/setup` in Production and picks any handle other than `ADMIN_USERNAME` (which defaults to `"admin"` when unset), `user.tesseraSub` becomes `"local:<chosen>"` instead of `"local:admin"`. Consequently:
  1. `viewer.isPrimaryAdmin` evaluates to `false`.
  2. `resolvePrimaryAdminNamespaceId` returns `null`, disabling primary-admin protection in `evaluatePrimaryAdminPatchPolicy` (`systemAdmin.ts:478`) and `canRemoveNamespaceEntry` (`systemAdmin.ts:631`) — allowing the sole admin to demote, disable, or delete themselves and permanently lock out the instance.
  3. `/admin/users` (`systemAdmin.ts:799`) and owner profile badges (`ui/overview.ts:189-195`) misidentify primary ownership.

---

#### `F-03` [High] Production D1-claimed primary admin is blocked in UI from changing or resetting their password

- **Evidence:**
  - Backend allows primary-admin password change when `ADMIN_PASSWORD` is unset (`src/worker/routes/authLogin.ts:434-436` & `src/worker/auth/session.ts:254`):
    ```ts
    if (viewer.isPrimaryAdmin && resolveAdminAuthConfig(c.env).password !== null) {
      return json({ ok: false, reason: "managed-by-env" } as const, 400);
    }
    ```
    ```ts
    hasD1Password = authConfig.password === null && Boolean(account?.hasPassword);
    ```
  - Frontend ignores `hasPassword` whenever `isPrimaryAdmin` is `true`:
    - `src/client/islands/change-password.tsx:53-67`: `if (isPrimaryAdmin)` renders a static `"Managed by environment configuration"` lock card before checking `hasPassword`.
    - `src/client/pages/AccountPage.tsx:229-230`: `isPrimaryAdmin ? "Env / Demo config" : ...`.
    - `src/client/islands/admin-users/UserFormModal.tsx:63, 110, 161, 254-263, 359`: hides password reset inputs and suppresses `payload.password` whenever `initialUser.isPrimaryAdmin` is `true`.
- **Root Cause & Impact:** In Production without an env `ADMIN_PASSWORD` (D1-claimed admin via `/auth/setup`), if `viewer.isPrimaryAdmin` is `true`, the UI locks out password updates on `/user/settings/security` and `/admin/users` even though the password lives in D1 and the API explicitly permits updating it.

---

#### `F-04` [High] Non-transactional `/auth/setup` causes permanent setup lockout on partial failure

- **Evidence:**
  - `src/worker/routes/authLogin.ts:592, 618-652`:
    ```ts
    if (await hasAnyRegisteredUsers(c.env.DB)) { ... return authErrorRedirect(c, "setup_locked", nextPath); }
    ...
    const user = await insertUserIfNew(db, ...);
    const namespace = await claimNamespace(db, ...);
    await insertMembershipIfMissing(db, ...);
    await upsertNamespaceDirectoryMeta(c.env.DB, namespace.id, ...);
    ```
- **Root Cause & Impact:** The 4 D1 writes execute sequentially without a D1 batch/transaction or compensating rollback. Any failure after `insertUserIfNew` leaves `users` non-empty, causing `hasAnyRegisteredUsers()` (`line 592`) to permanently return `setup_locked` on every retry even though the admin namespace/password setup never completed.

---

#### `F-05` [High] Password change and admin password reset do not invalidate existing sessions

- **Evidence:**
  - `src/worker/auth/session.ts:26-31, 198-206`:
    ```ts
    const SessionPayloadSchema = z.object({
      version: z.literal(SESSION_VERSION),
      userId: z.string(),
      createdAt: z.number(),
      expiresAt: z.number(),
    });
    ```
  - `src/worker/routes/authLogin.ts:482-489` (`POST /auth/api/change-password`) and `src/worker/routes/systemAdmin.ts:501, 578-585` (`PATCH /admin/api/users/:id`): only overwrite `passwordHash` in `directory_meta`; no session version/epoch or revocation timestamp is stored or validated during `readActiveSessionUncached`.
- **Root Cause & Impact:** Existing `goc_sess_` cookies remain valid for up to 30 days (`SESSION_TTL_MS`) after a user changes a compromised password or an admin resets a user's password.

---

#### `F-06` [Medium] UI displays `"Configured (ADMIN_PASSWORD set)"` and `"(env)"` even when running D1-claimed Production auth

- **Evidence:**
  - `src/worker/auth/adminAuth.ts:153-158`: returns `mode: "configured"` even when `password: null`.
  - Passed directly to SSR views (`src/worker/routes/systemAdmin.ts:709, 739, 769, 841, 886`).
  - `src/client/pages/AdminSettingsPage.tsx:103-107`:
    ```tsx
    {authMode === "configured" ? (
      <>Configured (<code className="font-mono">ADMIN_PASSWORD</code> set · Demo Login disabled)</>
    ) : ...}
    ```
  - `src/client/pages/AdminSecurityPage.tsx:138`: `login: {primaryAdminHandle} ({authMode === "configured" ? "env" : "demo"})`.
  - `src/client/pages/AdminSettingsPage.tsx:66, 79`: unconditionally labels Sign-in Username `(env-configured · private)`.
- **Root Cause & Impact:** Admins who initialized their account via `/auth/setup` (D1 PBKDF2 without `ADMIN_PASSWORD`) see false UI telemetry claiming an env `ADMIN_PASSWORD` is managing sign-in.

---

#### `F-07` [Medium] Auth rate limiter has a KV read-modify-write race condition and fails open

- **Evidence:**
  - `src/worker/auth/rateLimit.ts:119-153`:
    - `checkAuthRateLimit` (`lines 125-133`) reads `kv.get(key)` and returns `{ allowed: true }` if `ROUTES` is unbound or throws.
    - `bumpAuthRateLimitFailure` (`lines 145-152`) does a separate `kv.get(key)` followed by non-atomic `kv.put(key, ...)` and silently swallows errors.
- **Root Cause & Impact:** Concurrent failed login/setup bursts overwrite each other's counter increments due to KV eventual consistency and non-atomic RMW, allowing attackers to exceed the `8`-attempt window. KV outages silently bypass brute-force throttling.

---

#### `F-08` [Medium] Unconditional `__Host-` + `Secure` + `SameSite=None; Partitioned` session cookies break plain-HTTP non-localhost deployments

- **Evidence:**
  - `src/worker/auth/cookies.ts:11-23`:
    ```ts
    export const AUTH_COOKIE_PREFIX = "host";
    const SHARED_COOKIE_OPTIONS = {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      partitioned: true,
      prefix: AUTH_COOKIE_PREFIX,
    } as const satisfies CookieOptions;
    ```
- **Root Cause & Impact:** Works on HTTPS (Cloudflare edge / HTTPS tunnels) and `localhost` Chromium, but any plain-HTTP self-hosted or LAN IP server silently drops `__Host-goc_session` with `Secure`, causing a silent sign-in redirect loop with no error message.

---

### Group B — Backend Engines, Queues, Tier Limits & Git Protocol

#### `F-09` [High] Incremental `git fetch` permanently returns `503` when `REPO_TASKS_QUEUE` is unbound and a pack lacks `.refs`

- **Evidence:**
  - `src/worker/git/operations/fetch/plan.ts:132-139, 185-188`:
    ```ts
    schedulePackRefBackfill({ env, repoId, packKey: pack.packKey, cacheCtx, log, reason });
    ...
    const refSnapshot = await loadPackRefSnapshot(env, repoId, snapshot, cacheCtx);
    if (refSnapshot.type === "Missing") {
      throw new FetchPlanRetryError("missing-ref-index");
    }
    ```
  - `src/worker/tasks/dispatch.ts:113-125`:
    ```ts
    if (!hasRepoTasksQueue(args.env)) {
      args.log?.debug("queue:maintenance-skipped-no-binding", ...);
      return false;
    }
    ```
- **Root Cause & Impact:** If an active pack in R2 lacks its `.refs` sidecar index (e.g., legacy or interrupted write), initial full clones (`haves.length === 0`) succeed, but any incremental `git pull` / `git fetch` (`haves.length > 0`) calls `schedulePackRefBackfill` and throws `503 Retry-After: 10`. Under `--no-queues` / Free Tier without Queues, `sendOptionalMaintenanceTask` is a silent no-op and there is **no inline fallback**, leaving incremental fetches stuck returning `503` forever.

---

#### `F-10` [High] Manual compaction hangs `"queued"` without `REPO_TASKS_QUEUE` and stalls / risks Error 1102 on Free tier

- **Evidence:**
  - `src/worker/routes/admin.ts:69-96`: when `POST /:owner/:repo/admin/compact` runs with `{ dryRun: false }`, DO writes `compactionWantedAt` and Worker responds `202` `{ status: "queued" }`, calling `sendOptionalMaintenanceTask(...)` (which silently returns `false` if `REPO_TASKS_QUEUE` is unbound).
  - `src/worker/do/repo/catalog/compaction/requests.ts:103-122`: always returns `queued: true, message: "Recorded a compaction request... and queued background work."` regardless of Queue binding presence.
  - `src/worker/do/repo/scheduler.ts:42-44` & `src/worker/do/repo/catalog/compaction/lease.ts:285-289`:
    ```ts
    if (!shouldAutoQueueBackgroundCompaction(args.env)) {
      args.logger?.debug("compaction:alarm-rearm-skipped-tier", { doId });
      return false;
    }
    ```
  - `src/worker/common/tier.ts:44-46`: `shouldAutoQueueBackgroundCompaction` requires **both** `hasRepoTasksQueue(env)` **and** `CLOUDFLARE_TIER === "paid"`.
- **Root Cause & Impact:**
  1. **Without `REPO_TASKS_QUEUE` (`--no-queues`):** Clicking "Start Compaction" returns HTTP `202` claiming compaction is queued, sets `compactionWantedAt`, and keeps rescheduling DO alarms (`COMPACTION_REARM_DELAY_MS`) forever — compaction **never runs** unless manually cleared via `DELETE /admin/compact`.
  2. **On `CLOUDFLARE_TIER=free` even with a Queue binding:** `rearmCompactionQueueFromAlarm` skips queue re-arming because `shouldAutoQueueBackgroundCompaction` is `false`. If initial enqueue hits an active receive lease (`busy`) or multi-tier compaction returns `shouldRequeue: true`, subsequent passes stall in `"queued"`. Meanwhile, executing `handleCompactionMessage` on Free tier (`10ms` CPU limit) risks Cloudflare Worker Error `1102`.

---

#### `F-17` [High] Legacy Git Smart HTTP v0/v1 clients are rejected (`HTTP 400`) despite JSDoc claims

- **Evidence:**
  - `src/worker/routes/git.ts:95-117`:
    ```ts
    /**
     * Handles Git upload-pack (fetch) POST requests.
     * Supports both protocol v2 and legacy protocol based on Git-Protocol header.
     */
    ...
    if (!/version=2/.test(gitProto) && !command) {
      return new Response("Expected Git protocol v2 (set Git-Protocol: version=2)\n", {
        status: 400,
      });
    }
    ```
- **Root Cause & Impact:** Older Git clients, shallow tools, or HTTP proxies stripping the `Git-Protocol: version=2` header fail immediately with `400 Expected Git protocol v2` on `git-upload-pack` POST; there is no protocol v0/v1 negotiation path.

---

#### `F-18` [Medium] `systemAdmin.ts` caps cold DO branch lookups at 60 and creates an isolated `getLimiter()`

- **Evidence:**
  - `src/worker/routes/systemAdmin.ts:79, 169-173`:
    ```ts
    const MAX_COLD_BRANCH_LOOKUPS = 60;
    ...
    const toResolve = uncached.slice(0, MAX_COLD_BRANCH_LOOKUPS);
    const overflow = uncached.slice(MAX_COLD_BRANCH_LOOKUPS);
    for (const row of overflow) {
      branchById.set(row.id, "main");
    }
    ```
  - `src/worker/routes/systemAdmin.ts:271`:
    ```ts
    const limiter = getLimiter();
    ```
- **Root Cause & Impact:** Instances with >60 repositories whose `ROUTES` KV branch cache is cold silently show `defaultBranch: "main"` for repo #61+ even if their actual `HEAD` is `master` or `trunk`, and `getLimiter()` does not share `c.var.limiter`'s request-wide subrequest accounting.

---

#### `F-19` [Medium] Non-atomic `waitUntil` repo-state sync can serve stale cached refs/trees after push

- **Evidence:**
  - `src/worker/routes/git.ts:221-247`: `handleReceivePackPOST` executes `touchRepositoryUpdatedAt`, `deleteRepoBranchCacheRecord`, and `cacheDeleteJSON` inside `onRepoStateChanged` (called asynchronously in `streamReceivePack.ts` via `ctx.waitUntil`) and catches/logs failures without surfacing them.
- **Root Cause & Impact:** If D1 or Cache API blips after DO `finalizeReceive()` succeeds, `repositories.updated_at` stays stale, causing `ls-refs` (`git.ts:120-139`) and web UI views keyed by `updatedAt` to serve stale cached refs/trees until TTL expiry.

---

#### `F-20` [High] `cf-auto-deploy.mjs` manages unused legacy secrets and syncs `SESSION_SECRET` _after_ `wrangler deploy`

- **Evidence:**
  - `scripts/cf-auto-deploy-lib.mjs:11-15`:
    ```js
    export const REQUIRED_WORKER_SECRETS = [
      "SESSION_SECRET",
      "CREDENTIAL_SECRET",
      "ADMIN_BOOTSTRAP_SECRET",
    ];
    ```
  - `scripts/cf-auto-deploy.mjs:476-511`:
    - Line `477`: runs `npx wrangler deploy`.
    - Lines `480-511`: Phase D (`planSecretReconciliation` + `putWorkerSecret`) runs **after** deployment.
- **Root Cause & Impact:**
  1. `CREDENTIAL_SECRET` and `ADMIN_BOOTSTRAP_SECRET` have zero runtime usages in `src/worker/` or `wrangler*.jsonc`, creating dead secrets in Cloudflare.
  2. On a brand-new Production install, `wrangler deploy` goes live **before** `SESSION_SECRET` is uploaded, creating a live window where every sign-in or `/auth/setup` fails with `session_create_failed`.

---

#### `F-21` [Medium] `npm run format:check` fails on clean checkout and 22 unused AI Studio files are shipped in static Production assets

- **Evidence:**
  - Live `npm run format:check` (`prettier --check .`) exited with code **1**, reporting unformatted files:
    - `public/assets/aistudio/VIB_TOOLS_COMPANY_AUTHOR_MASTER_CONTEXT_528b6a24.md`
    - `wrangler.paid.jsonc`
  - Directory listing of `/public/assets/aistudio` confirms **22 files** (`20` PNG screenshots, `1` Markdown spec, `1` `index_439f1e4c.html`), none referenced by `src/`.
- **Root Cause & Impact:** Every `npm run build` copies `/public/assets/aistudio/*` into `dist/client/assets/aistudio/*` and serves static design captures publicly from the Production Cloudflare Workers Assets origin, while breaking CI Prettier checks.

---

### Group C — UI Features vs. Backend Reality, Missing UX & Design-System Compliance

#### `F-11` [Medium] Homepage language metadata is fabricated client-side via regex, filter options are hardcoded, and empty repos leak `"Vib Tools"` branding

- **Evidence:**
  - `src/worker/index.ts:99-108, 158-167, 195-204`: Server props omit `language`, `langColor`, `license`, `version`, and `topics`.
  - `src/client/islands/home-repos.tsx:99-123`: `resolveRepoLanguage` inspects `${repo.slug} ${repo.description ?? ""}` with regexes (e.g., `/\bgo\b/i` matches English `"go"`, while C++/Java/empty-description repos show no language).
  - `src/client/islands/home-repos.tsx:212-215`:
    ```ts
    if (set.size === 0) {
      set.add("TypeScript");
      set.add("Python");
    }
    ```
  - `src/client/islands/home-repos.tsx:439-440`:
    ```tsx
    {
      repo.description || "Official open-source repository published by Vib Tools.";
    }
    ```
  - `src/shared/branding.ts:28-50`: `DEFAULT_SITE_BRANDING` defaults `siteName: "gitra"`, `websiteUrl: "https://vibtools.io"`, `docsUrl: "https://docs.vib.tools"`, `supportEmail: "support@vibtools.io"`.
- **Root Cause & Impact:** In Production with real custom repositories, Language badges are heuristic guesses, the Language filter dropdown advertises `TypeScript` and `Python` even when 0 repositories match them (leading to empty filter results), and any public repository without a description falsely claims to be an `"Official open-source repository published by Vib Tools."`.

---

#### `F-12` [Medium] Repository web UI only supports text file create/edit (missing upload, rename, delete, folder create, and branch/tag UI) and stamps `@local.dev` emails

- **Evidence:**
  - `src/client/islands/repo-overview-actions.tsx:111-131` & `src/client/islands/blob-editor.tsx`: UI exposes only `Add README`, `Add file`, and `Edit file` (`PUT /auth/api/repositories/:repositoryId/file` with `MAX_WEB_COMMIT_BYTES`).
  - `src/worker/routes/admin.ts:129-165`: `GET/PUT /:owner/:repo/admin/refs` exists as an admin JSON API, but no web UI renders branch creation, branch deletion, default-branch switching (`HEAD`), or tag management.
  - `src/worker/routes/authRepositories.ts:305, 326, 421, 503`:
    ```ts
    authorEmail: `${authorSlug}@local.dev`,
    ```
- **Root Cause & Impact:** Users cannot upload binary files, delete/rename/move files, create empty folders (`.gitkeep`), or create/delete branches/tags via the web interface, and every web commit stamps synthetic `@local.dev` author emails into real Git commit objects.

---

#### `F-13` [Medium] Zero Global Toast system; silent clipboard failures and abrupt `window.location.reload()` timers

- **Evidence:**
  - Clipboard errors are silently discarded or only console-logged across:
    - `src/client/islands/home-repos.tsx:325-327` (`catch { // ignore silently }`)
    - `src/client/islands/system-admin/RepositoriesSection.tsx:247-249`
    - `src/client/islands/system-admin/TokensSection.tsx:112`
    - `src/client/islands/blob-actions.tsx:33-35` (`console.warn("Copy failed", error)`)
  - `src/client/islands/repo-admin/useRepoAdminActions.ts:59-61, 114-116, 136-138`: uses local banners plus raw `window.setTimeout(() => window.location.reload(), ...)` instead of a unified Toast notification system.
- **Root Cause & Impact:** Users in restricted iframe/HTTP clipboard contexts receive zero feedback when Copy fails, and there is no global Toast component displaying unified original API error/success notifications across pages.

---

#### `F-14` [Medium] Zero PWA support (no Web App Manifest, Service Worker, or installable mobile assets)

- **Evidence:**
  - `vite.config.ts:28`: `manifest: "manifest.json"` only generates Vite's SSR chunk map inside `dist/client/`, not a PWA `manifest.webmanifest`.
  - `src/client/server/document.tsx:45-76`: no `<link rel="manifest">`, no `apple-touch-icon`, no `theme-color` meta, and no Service Worker (`sw.js`) registration.
  - `/public` contains only `assets/aistudio/` — zero app icons or offline service worker.
- **Root Cause & Impact:** The app is responsive CSS only; it is not an installable PWA and has no offline shell or mobile home-screen manifest support.

---

#### `F-15` [Medium] Design-system & global UI-component consistency violations (`--radius: 0rem`, font stack, shadows, bypassed `ui/*` primitives)

- **Evidence:**
  - `src/client/styles/app.css:11, 13`:
    ```css
    --font-sans: "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
    ```
    (Missing `"Segoe UI Web"` and `"Helvetica Neue"`, and lacks `--radius: 0rem` override).
  - Global border-radius & shadow usage across shared UI primitives:
    - `src/client/components/ui/button.tsx:26`: `rounded-md`
    - `src/client/components/ui/confirm-modal.tsx:88, 99, 132`: `rounded-md`, `shadow-lg`
    - `src/client/components/ui/card.tsx`, `input.tsx`, `badge.tsx`: `rounded-md` / `rounded-full`
  - Islands duplicate raw `<button>`, `<input>`, `<table>`, and modal markup instead of importing `@/client/components/ui` (`change-password.tsx`, `UserFormModal.tsx`, `RepositoriesSection.tsx`, `home-repos.tsx`, `repo-overview-actions.tsx`, `header-menus.tsx`).
- **Root Cause & Impact:** Styles cannot be updated from one global source of truth, violating both the strict component-only UI rule and the flat zero-radius (`--radius: 0rem`, no shadow) specification.

---

#### `F-16` [Low] `handleRawPath` hotlink check rejects direct raw links and reverse-proxied host headers

- **Evidence:**
  - `src/worker/routes/ui/raw.ts:87-98`:
    ```ts
    const referer = c.req.raw.headers.get("referer") || "";
    let allowedReferer = false;
    if (referer) {
      try {
        allowedReferer = new URL(referer).host === url.host;
      } catch {
        allowedReferer = false;
      }
    }
    if (!allowedReferer) {
      return new Response("Hotlinking not allowed\n", { status: 403 });
    }
    ```
- **Root Cause & Impact:** Any direct navigation/right-click "Open image in new tab" or Privacy/Referrer-Policy stripping `Referer` receives `403 Hotlinking not allowed`, and `url.host` is compared directly instead of honoring `x-forwarded-host` or `Sec-Fetch-Site`.

---

## 4. Verified Test, Typecheck, Build & Format Command Results

| Check Command                                  | Status   | Exact Verified Output                                                                                                                                                               |
| :--------------------------------------------- | :------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                            | **PASS** | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`                                                                                      |
| `npm run test`                                 | **PASS** | `14` test files passed, `75` tests passed (`vitest.unit.config.ts`)                                                                                                                 |
| `node --test test/cf-auto-deploy.node-test.ts` | **PASS** | `8` tests passed, `0` failed                                                                                                                                                        |
| `npm run build`                                | **PASS** | `vite build` exited `0`                                                                                                                                                             |
| `npm run format:check`                         | **FAIL** | Exit `1` — unformatted: `public/assets/aistudio/VIB_TOOLS_COMPANY_AUTHOR_MASTER_CONTEXT_528b6a24.md`, `wrangler.paid.jsonc`                                                         |
| `npm run test:workers`                         | **FAIL** | `57 passed \| 1 failed (58)` files, `349 passed \| 1 failed (350)` tests — failed at `test/demo-user-mock-repo.worker.test.ts:155:31` (`footer` `<a href="/admin">` after `<main>`) |

---

## 5. Recommended Incremental Fix Roadmap (High-Level Only)

Based on dependencies and blast radius across the **21 verified findings**, remediation fits cleanly into **5 incremental phases** (no detailed implementation patches yet):

1. **Phase 1 — Immediate Regression Fix & Auth/Setup Integrity (`F-01`, `F-02`, `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08`)**  
   Fix `footer.tsx` profile href & make `npm run test:workers` 100% green; unify Production `/auth/setup` primary-admin identity (`ADMIN_USERNAME`/D1 subject), transactional setup batching, D1 password-change UI support, session revocation epoch, accurate env-vs-D1 UI labels, atomic/fail-closed rate limiting, and HTTPS-aware cookie options.
2. **Phase 2 — Background Jobs, Compaction, Free/Paid Tier & Git Edge Engines (`F-09`, `F-10`, `F-17`, `F-18`, `F-19`)**  
   Eliminate permanent `503` on incremental fetch (`--no-queues` inline `.refs` fallback or recovery), prevent `"queued"` compaction stalls & Free-tier CPU 1102 hazards, decide/support or cleanly document Git v0/v1 vs v2 response, lift the 60-repo cold-branch cap with shared request limiter, and harden D1/KV invalidation sync.
3. **Phase 3 — Real Repo Metadata & Web Git Editing Completeness (`F-11`, `F-12`, `F-16`)**  
   Replace fake regex language guessing & hardcoded `Vib Tools` fallbacks with real server-derived repo metadata and customizable empty branding defaults; add binary upload / delete / rename / branch-tag management UI and configurable author commit emails; refine `rawpath` `Sec-Fetch-Site` / forwarded-host check.
4. **Phase 4 — Global Design System, Unified Components, Toast System & PWA (`F-13`, `F-14`, `F-15`)**  
   Centralize all UI primitives (`--radius: 0rem`, `--font-sans` Segoe/Helvetica fallback stack, flat zero-shadow borders), eliminate per-island duplicate controls, add a global Toast notification provider for real API/clipboard feedback, and add PWA `manifest.webmanifest`, icons, and Service Worker.
5. **Phase 5 — Deploy Pipeline, Secret Hygiene & Repository Cleanup (`F-20`, `F-21`)**  
   Upload `SESSION_SECRET` before/atomically with first `wrangler deploy`, prune unused `CREDENTIAL_SECRET` / `ADMIN_BOOTSTRAP_SECRET` generation, remove unreferenced `/public/assets/aistudio/` artifacts from Production bundle, and restore passing `npm run format:check`.
