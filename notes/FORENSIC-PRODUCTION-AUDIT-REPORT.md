# Forensic Production Audit Report — `git-on-cloudflare`

**Audit Scope:** Full-stack source-code forensic verification of Production vs. Demo Mode behavior, UI claims vs. backend reality, authentication/RBAC/ACL enforcement, Git Smart HTTP v2 & Repo Durable Object/R2/D1 engines, caching, and build/typecheck/test health.  
**Audit Method:** Read-only code inspection and live test/build/typecheck execution. Zero source or configuration files were modified during this audit.

---

## 1. Executive Summary & Bug Tally

The **core Git engine** (Git Smart HTTP v2 `ls-refs` / `fetch` streaming, streaming `git-receive-pack`, R2 packfile + `.idx` v2 + `.refs` sidecar storage, multi-tier compaction, queue consumer lifecycle, and real D1 + PBKDF2-SHA256 + AES-256-GCM authentication) is genuinely implemented—not mocked—and operates in both Demo Mode and Production Mode.

However, **23 verified bugs** prevent clean Production readiness across security/RBAC enforcement, data-deletion atomicity, edge caching, UI-to-backend parity, embedded iframe compatibility, white-label branding, and static/automated test tooling.

| Severity     |  Count | Bug IDs                                                                                  |
| ------------ | -----: | ---------------------------------------------------------------------------------------- |
| **Critical** |      3 | `BUG-01`, `BUG-02`, `BUG-03`                                                             |
| **High**     |      8 | `BUG-04`, `BUG-05`, `BUG-06`, `BUG-07`, `BUG-08`, `BUG-09`, `BUG-10`, `BUG-11`           |
| **Medium**   |      9 | `BUG-12`, `BUG-13`, `BUG-14`, `BUG-15`, `BUG-16`, `BUG-17`, `BUG-18`, `BUG-19`, `BUG-20` |
| **Low**      |      3 | `BUG-21`, `BUG-22`, `BUG-23`                                                             |
| **Total**    | **23** | **`BUG-01` – `BUG-23`**                                                                  |

---

## 2. Verified Build, Typecheck & Test Matrix

| Check Command                                                                                                     | Status                                       | Verified Result & Evidence                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build`                                                                                                   | **PASS** (`BUILD_EXIT=0`)                    | Vite SSR worker (`dist/git_on_cloudflare/index.js`) and client assets (`dist/client/manifest.json`) built cleanly.                                                                                                       |
| `npm run typecheck`                                                                                               | **PASS** (`TEST_TSC_EXIT=0`)                 | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`.                                                                                                                          |
| `npx tsc --noEmit` (root `tsconfig.json`)                                                                         | **FAIL** (`ROOT_TSC_EXIT=2`)                 | **10 TypeScript errors** across 6 files (`src/worker/registry/index.ts:5`, `src/worker/auth/adminAuth.ts:92`, 4 `src/shared/**/*.test.ts` files). See `BUG-10`.                                                          |
| `npm run test` (`vitest.unit.config.ts`)                                                                          | **FAIL** (`UNIT_EXIT=1`)                     | **9 suites (54 tests) passed; 5 suites crashed at import** due to `Error: Cannot find package 'cloudflare:workers'` from `src/worker/git/pack/indexer/resolve/index.ts:19`. See `BUG-10`.                                |
| `npm run format:check`                                                                                            | **FAIL** (`FMT_EXIT=1`)                      | **0 issues in `src/` or `test/`**; failed on 7 files in `.aistudio/artifacts/...` and `.playwright-cli/...`. See `BUG-23`.                                                                                               |
| `npx vitest run --config vitest.config.ts test/auth.worker.test.ts`                                               | **PASS** (`WORKER_BATCH1_EXIT=0`)            | `3 passed (3)` (`test/auth.worker.test.ts`).                                                                                                                                                                             |
| `npx vitest run --config vitest.config.ts test/repository-delete.worker.test.ts`                                  | **PASS**                                     | `3 passed (3)`.                                                                                                                                                                                                          |
| Targeted ACL/Admin/Repo Worker Tests (`system-admin`, `pat-verify`, `git-acl`, `admin-disclosure`, `repo-create`) | **PASS** (`B3_EXIT=0`)                       | `5 test files passed, 58 tests passed` (`test/system-admin.worker.test.ts`, `test/pat-verify.worker.test.ts`, `test/git-acl.worker.test.ts`, `test/admin-disclosure.worker.test.ts`, `test/repo-create.worker.test.ts`). |
| `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts`                                        | **FAIL** (`GHF_EXIT=1`)                      | Assertion failure at `test/github-feel.worker.test.ts:254:28` (stale string assertions against updated `HomePage.tsx`). See `BUG-10`.                                                                                    |
| Batch: `streaming-receive`, `streaming-compaction`, `alarm-cleanup`, `github-feel`                                | **3 PASS / 1 FAIL** (`WORKER_BATCH2_EXIT=1`) | `26 tests passed`, `1 failed` (`github-feel.worker.test.ts:254`). Note: full 60+ file `npm run test:workers` suite was not run end-to-end; targeted batches verified above.                                              |

---

## 3. Feature Audit Matrix: Demo Mode vs. Production Mode & UI vs. Backend Reality

### 3.1 What Actually Works in Both Demo Mode & Real Production Mode

- **Runtime Mode Switching (`src/worker/auth/adminAuth.ts:87-165`, `src/worker/routes/authLogin.ts:447-458`):**
  - Production builds (`import.meta.env.PROD === true`), `AUTH_MODE=production`, or setting `ADMIN_PASSWORD` switch `resolveAdminAuthConfig()` to `mode: "configured"`.
  - `/auth/demo-login` strictly returns HTTP `403 {"error":"Demo login is disabled in production mode"}` (`authLogin.ts:455-458`), `AuthSignInPage.tsx:105-152` hides demo buttons/credentials, and `ensureDemoWorkspaceOnPublicEntry` (`src/worker/index.ts:56-67`) becomes a no-op so zero demo accounts or repos are seeded.
- **Real User Auth & Password Storage (`src/worker/auth/session.ts:15-90`, `src/worker/auth/adminAuth.ts:171-224`, `src/worker/routes/authLogin.ts:227-375`):**
  - Sessions use HKDF-SHA256 + AES-256-GCM sealed `HttpOnly; Secure; SameSite=None; Partitioned` `__Host-goc_session` cookies (`cookies.ts:17-23`). Directory user passwords use PBKDF2-SHA256 (`100,000` iterations, 16-byte salt).
- **Git Smart HTTP v2 Engine (`src/worker/routes/git.ts:98-487`, `src/worker/git/operations/uploadStream/index.ts:38-90`, `src/worker/git/receive/streamReceivePack.ts:1-100`):**
  - Genuine streaming `upload-pack` (`ls-refs`, `fetch`, gzip decoding, sideband-64k) and streaming `receive-pack` backed by `RepoDurableObject` SQLite pack catalogs + R2 `.pack`/`.idx`/`.refs` objects.
  - Multi-tenant PAT authentication over HTTP Basic (`src/worker/auth/gitAuth.ts:46-64`, `src/worker/auth/pat.ts:201-315`) works for repo-scoped, namespace-scoped, and active-admin global PATs (subject to `BUG-02` revocation gap).
- **Repository Creation & Web File Editor (`src/worker/routes/authRepositories.ts:188-352, 433-512`):**
  - Creating repos, writing initial `README.md` / `.vibtools/profile/README.md`, and committing file edits via the web UI (`commitRepositoryFile`) execute real `buildPackV2` -> R2 upload -> DO `beginReceive`/`finalizeReceive` commits.

### 3.2 Demo-Only / Hardcoded Behaviors vs. Real Production Gaps

| Feature / Surface                                         | Demo Mode (`mode === "demo"`)                                                                                                            | Real Production (`mode === "configured"`)                                                                                                                                                                                                  | Gap / Verdict                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Primary Admin Login & Seed Data                           | `admin`/`admin123` + `alex-dev`/`devuser123` + 1-click `/auth/demo-login` + auto-seeded repos (`demoSeed.ts:73-109, 1001-1123`).         | `/auth/demo-login` disabled (`403`). If `ADMIN_PASSWORD` is unset, primary admin login fails closed (`adminAuth.ts:148-153`); instance starts empty.                                                                                       | **Works as designed** for auth lockdown, but homepage still renders hardcoded `"Vib Tools"` organization portal (`BUG-19`). |
| Repo Admin Page (`/:owner/:repo/admin`)                   | Works for seeded admin/member repos.                                                                                                     | Accessible by **`viewer` role accounts** (`BUG-01`) and relies on **`window.alert`/`confirm`/`prompt`** (`BUG-12`).                                                                                                                        | **Critical Security Bug + Iframe Blocker**                                                                                  |
| System Admin Repo Create & Delete (`/admin/repositories`) | Works only on Admin's own `@admin` namespace.                                                                                            | Creating or deleting a repo inside another user's namespace (`@alex-dev`, etc.) **fails with `403 not-member`** even when the Admin dropdown shows that namespace (`BUG-05`, `BUG-06`). Deleting an owned repo orphans R2 & DO (`BUG-05`). | **UI / Backend Mismatch + Data Orphan**                                                                                     |
| System Admin PAT Minting (`/admin/tokens`)                | Global PATs & own-namespace PATs work.                                                                                                   | Selecting another user's `@namespace` in Target dropdown **fails with `403 Forbidden`** (`BUG-06`); `/admin/tokens` lists only the logged-in admin's own tokens (`BUG-18`).                                                                | **UI / Backend Mismatch**                                                                                                   |
| Disabled / Demoted User Revocation                        | Claimed "revoked immediately" on `/admin/security`.                                                                                      | Browser session revoked only if D1 succeeds (`BUG-03`); **scoped Git PATs (`repo`/`namespace`) keep working indefinitely** (`BUG-02`).                                                                                                     | **Critical Security Bug**                                                                                                   |
| `/admin/settings` Control Panel                           | Displays static instance overview cards.                                                                                                 | Zero mutable settings exist anywhere on `/admin/settings`; strictly read-only metadata (`BUG-19`).                                                                                                                                         | **UI Claim Misleading / Non-Configurable**                                                                                  |
| Post-Push Cache Freshness (`git push` / Web Commit)       | Authenticated UI calls bypass cache (`markRequestPrivate`), masking stale caches during logged-in demos.                                 | **Anonymous/public viewers see stale refs, root trees, and commits for 60–300s** due to missing invalidation & unversioned cache keys (`BUG-07`).                                                                                          | **High Freshness Bug in Production**                                                                                        |
| Organization Identity, Links & Status                     | Hardcoded `"Vib Git"`, `"git.vibtools.io"`, `"Vib Tools"`, `"support@vibtools.io"`, `"https://vibtools.io"`, `"https://docs.vib.tools"`. | Identical hardcoded third-party branding & domain in `wrangler.jsonc`, `header.tsx`, `footer.tsx`, `HomePage.tsx`, `home-repos.tsx`, and fake `"Status"` -> `/explore` (`BUG-19`).                                                         | **Not White-Labeled / Production Branding Defect**                                                                          |

---

## 4. Exhaustive Forensic Bug Catalogue (`BUG-01` – `BUG-23`)

### Critical Severity

#### BUG-01: Role Check Bypass on Repo Admin UI (`/:owner/:repo/admin`) & Admin APIs (`viewer` Privilege Escalation)

- **Files:**
  - `src/worker/routes/ui/helpers.ts:310-353` (`resolveAdminPageRepoAccess`)
  - `src/worker/routes/ui/helpers.ts:368-400` (`resolveAdminApiRepoAccess`)
  - `src/worker/routes/ui/adminPage.ts:48-57` (`handleAdminPage`)
  - Contrast with `src/worker/routes/ui/helpers.ts:282-286` (`canViewerManageRepo`)
- **Evidence:**
  ```ts
  // src/worker/routes/ui/helpers.ts:333-352
  const membership = await loadSessionMembership(c, route.namespaceId);
  if (membership.kind === "anonymous") { ... }
  if (membership.kind === "signed-in-non-member") { ... }

  const cacheCtx = c.var.cacheCtx;
  markRequestPrivate(cacheCtx);
  return { kind: "ok", route, cacheCtx, viewer: membership.viewer, limiter: c.var.limiter };
  ```
  ```ts
  // src/worker/routes/ui/adminPage.ts:55-56
      visibility: route.visibility,
      canManageRepo: true,
  ```
  While `canViewerManageRepo` (`helpers.ts:282-286`) requires `canWriteRepositories(access.viewer.role)` to hide the "Admin" tab from `viewer` accounts in repo navigation, neither `resolveAdminPageRepoAccess` nor `resolveAdminApiRepoAccess` (used by `requireRepoAdmin` in `src/worker/routes/admin.ts`) checks `canWriteRepositories(membership.viewer.role)`.
- **Impact (Demo & Production):** Any namespace member assigned the read-only `viewer` role can navigate directly to `/:owner/:repo/admin` and execute destructive repository operations: overwrite refs (`PUT /admin/refs`), move `HEAD` (`PUT /admin/head`), delete packs (`DELETE /admin/pack/:packKey`), run compaction (`POST|DELETE /admin/compact`), or permanently purge the repository (`DELETE /admin/purge`).
- **Fix:** Enforce `if (!canWriteRepositories(membership.viewer.role))` inside both `resolveAdminPageRepoAccess` (returning 403 `adminForbidden()`) and `resolveAdminApiRepoAccess` (returning 403 `adminJsonError("Forbidden", 403)`).

---

#### BUG-02: Scoped Git PATs Remain Valid After User Is Disabled or Demoted to `viewer`

- **File:** `src/worker/auth/pat.ts:227-275` (`verifyPat`)
- **Evidence:**
  ```ts
  // src/worker/auth/pat.ts:228-253
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
        ...
        level: namespaceGrant.level,
        ...
      };
    }
  ```
  Notice `isPatOwnerActiveAdmin(env, db, pat.userId)` is checked ONLY in the `globalGrant` branches (`pat.ts:259, 285`). Neither `repoGrant` (`:228-241`) nor `namespaceGrant` (`:242-253`) inspects the token owner's `status === "disabled"` or `role === "viewer"`.
- **Impact (Demo & Production):** Directly contradicts the guarantee shown on `/admin/security` (`src/client/pages/AdminSecurityPage.tsx:117`: `"Disabled Accounts: revoked immediately"`). A disabled user or a user demoted to `viewer` retains full Git CLI `clone` and `push` access via any previously minted repo- or namespace-scoped PAT.
- **Fix:** In `verifyPat`, resolve the owner's directory status and role before accepting `repoGrant` or `namespaceGrant`: reject disabled users (`status === "disabled"`), and disallow `level === "push"` (or return read-only/rejected) if the user was demoted to `"viewer"`.

---

#### BUG-03: Fail-Open D1 Directory Fallback Elevates `disabled` or `viewer` Browser Sessions to `member`

- **File:** `src/worker/auth/session.ts:261-289` (`loadViewerUncached`)
- **Evidence:**
  ```ts
  // src/worker/auth/session.ts:261-288
  try {
    const account = await findDirectoryAccountByUserId(c.env.DB, c.var.db, active.user.id);
    if (account) {
      if (account.status === "disabled") {
        return null;
      }
      return { ... role: account.role ... };
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
- **Impact (Demo & Production):** If `findDirectoryAccountByUserId` throws a transient D1 error or returns `null` (e.g., user has a session cookie but no `namespaces.createdBy` row), non-primary-admin sessions fail open with `role: "member"` and `status` unchecked—granting temporary read/write access to disabled accounts or elevating `viewer` accounts to `member`.
- **Fix:** Fail closed (return `null`) on transient D1 metadata errors for non-primary-admin sessions, and default missing directory metadata (only if user row legitimately has no directory row and no error occurred) conservatively to read-only `"viewer"` rather than `"member"`.

---

### High Severity

#### BUG-04: Stored XSS via Inline `image/svg+xml` on `/:owner/:repo/rawpath` + `Content-Disposition` Header Injection

- **Files:**
  - `src/worker/routes/ui/blob.ts:160-165` (`handleBlob`)
  - `src/worker/routes/ui/raw.ts:34-38, 63-90` (`handleRaw`, `handleRawPath`)
- **Evidence:**
  ```ts
  // src/worker/routes/ui/blob.ts:160
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"].includes(ext);
  ```
  ```ts
  // src/worker/routes/ui/raw.ts:86-90
  headers.set("Content-Type", getContentTypeFromName(name));
  if (isPrivate) headers.set("Cache-Control", "no-store");
  if (download) headers.set("Content-Disposition", `attachment; filename="${name}"`);
  else headers.set("Content-Disposition", `inline; filename="${name}"`);
  ```
  `handleRaw` safely forces `Content-Type: text/plain; charset=utf-8` (`raw.ts:31`), whereas `handleRawPath` serves `getContentTypeFromName(name)` (`image/svg+xml`) with `Content-Disposition: inline`, guarded solely by same-host `Referer` (`raw.ts:68`). Additionally, both `handleRaw` (`:35,37`) and `handleRawPath` (`:88,89`) interpolate query params `fileName` / `name` straight inside `"..."` in `Content-Disposition` with no quote/backslash/CRLF sanitization.
- **Impact:** Any user who pushes a malicious `.svg` containing `<script>` and triggers a same-origin link or Markdown navigation to `/:owner/:repo/rawpath?ref=...&path=evil.svg` executes same-origin JavaScript in the browser (capable of calling CSRF-protected endpoints such as `/auth/api/tokens` or `/admin/api/*` since cookies/origin are same-origin). Unescaped `name` allows header parameter injection.
- **Fix:** For `handleRawPath`, either force `Content-Type: text/plain; charset=utf-8` or add `Content-Security-Policy: sandbox` (plus `X-Content-Type-Options: nosniff`) or exclude `.svg` from inline rendering (`attachment`); sanitize `filename` with RFC 6266 / strict basename stripping (`["\r\n\\]`).

---

#### BUG-05: `DELETE /admin/api/repositories/:id` & `DELETE /admin/api/users/:userId` Orphan R2 Packs, DO Storage & `ROUTES` KV (Plus Admin Repo-Delete Cross-Namespace 403)

- **Files:**
  - `src/worker/routes/systemAdmin.ts:800-837` (`DELETE /admin/api/repositories/:repositoryId`)
  - `src/worker/routes/systemAdmin.ts:535` -> `src/worker/db/d1/dal/adminDirectory.ts:452-494` (`deleteNamespaceEntry`)
  - Contrast with `src/worker/routes/admin.ts:262-284` (`DELETE /:owner/:repo/admin/purge`)
- **Evidence:**
  ```ts
  // src/worker/routes/systemAdmin.ts:800-807, 826-837
  const isMember = await viewerIsNamespaceMember(db, viewer.userId, repo.namespaceId);
  if (!isMember) {
    ...
    return json({ ok: false, reason: "not-member" } as const, 403);
  }
  ...
  const deleted = await deleteRepositoryById(db, repositoryId);
  ...
  if (namespace) {
    enqueueRouteCacheSync(c, log, {
      repositoryId,
      namespaceSlug: namespace.slug,
      repoSlug: repo.slug,
    });
  }
  ```
  ```ts
  // src/worker/db/d1/dal/adminDirectory.ts:461
  await db.delete(repositories).where(eq(repositories.namespaceId, namespaceId));
  ```
  1. `DELETE /admin/api/repositories/:id` deletes only the D1 row (`deleteRepositoryById`) and syncs `ROUTES`, **never** enqueuing `{ kind: "repository-delete" }` on `REPO_TASKS_QUEUE`, permanently orphaning all R2 pack/idx/refs objects and `RepoDurableObject` SQLite/storage. (`DELETE /:owner/:repo/admin/purge` properly enqueues `repository-delete` at `admin.ts:275`.)
  2. `systemAdmin.ts:800-807` blocks Site Admins from deleting any repository outside namespaces they belong to (`403 not-member`), even though `RepositoriesSection.tsx` renders Delete buttons for all repositories and `PATCH /admin/api/repositories/:id` permits cross-namespace admin management (`authRepositories.ts:88-95`).
  3. `deleteNamespaceEntry` (`adminDirectory.ts:461`) deletes `repositories` in D1 without collecting `doName`/`slug` to enqueue `repository-delete` or clear `ROUTES` KV, and leaves `namespace_profile_meta` / `repository_meta` rows behind.
- **Fix:** Unify System Admin repository and user deletion onto the `repository-delete` queue pipeline (`c.env.REPO_TASKS_QUEUE.send(...)` before/instead of premature D1 deletion), allow `viewer.role === "admin"` on `DELETE /admin/api/repositories/:id`, and clean `ROUTES` KV + `namespace_profile_meta` / `repository_meta` when deleting namespaces.

---

#### BUG-06: System Admin UI Exposes Cross-Namespace Repo Creation & Token Issuance That Backend Rejects (`403`)

- **Files:**
  - `src/client/islands/system-admin/TokensSection.tsx:184-190` (`TokensSection` -> `POST /auth/api/tokens`)
  - `src/worker/routes/authTokens.ts:219-225` (`POST /auth/api/tokens` membership guard)
  - `src/client/islands/system-admin/RepositoriesSection.tsx:108-145` (`RepositoriesSection` -> `POST /auth/api/repositories`)
  - `src/worker/routes/authRepositories.ts:237-243` (`POST /auth/api/repositories` membership guard)
- **Evidence:**
  ```tsx
  // src/client/islands/system-admin/TokensSection.tsx:183-189
  <option value={GLOBAL_PAT_TARGET_VALUE}>All namespaces (Global)</option>
  {activeNamespaces.length > 0 ? (
    activeNamespaces.map((ns) => (
      <option key={ns.id} value={ns.slug}>@{ns.slug}</option>
    ))
  ```
  ```ts
  // src/worker/routes/authTokens.ts:219-225
  if (!(await viewerIsNamespaceMember(db, viewer.userId, namespace.id))) {
    log.warn("pat:create-not-member", { userId: viewer.userId, namespaceId: namespace.id });
    return json({ error: "Forbidden" }, 403);
  }
  ```
  The exact same mismatch happens on `/admin/repositories`: `RepositoriesSection.tsx:108-121` submits `namespaceSlug` for any active user namespace to `POST /auth/api/repositories`, which returns `403 {"ok":false,"reason":"not-member"}` (`authRepositories.ts:237-243`). Note also `RepositoriesSection.tsx:141` hardcodes `defaultBranch: "main"` in optimistic state.
- **Impact (Demo & Production):** Selecting `@alex-dev` (or any non-admin user) in System Admin's "New repository" or "Target" PAT dropdown always fails with `403`.
- **Fix:** Either grant active `admin` accounts explicit cross-namespace authority on dedicated `/admin/api/repositories` & `/admin/api/tokens` endpoints (or allow active admin in `authRepositories`/`authTokens`), or filter the target dropdowns strictly to namespaces the actor is authorized to manage.

---

#### BUG-07: Missing Edge Cache Invalidation After CLI `git push` & Unversioned/Mismatched Cache Keys (`/_cache/*`)

- **Files:**
  - `src/worker/routes/git.ts:125-131, 202-224` (`ls-refs`, `handleReceivePackPOST`)
  - `src/worker/routes/ui/adminPage.ts:30`, `src/worker/routes/ui/refsApi.ts:14`
  - `src/worker/routes/ui/tree.ts:66-78`, `src/worker/routes/ui/commits.ts:72-92`, `src/worker/routes/ui/overview.ts:148, 262, 309-355`
  - `src/worker/git/commitFile.ts:293-325`
- **Evidence:**
  ```ts
  // src/worker/routes/git.ts:210-215
  return await handleStreamingReceivePackPOST(env, route.doName, request, ctx, {
    onRepoStateChanged: async ({ changed }) => {
      if (!changed) return;
      await touchRepositoryUpdatedAt(db, route.repositoryId, Date.now());
  ```
  ```ts
  // src/worker/git/commitFile.ts:296-311
  cacheDeleteJSON(buildCacheKeyFrom(input.cacheCtx.req, "/_cache/refs", { repo: input.doName })),
  cacheDeleteJSON(buildCacheKeyFrom(input.cacheCtx.req, "/_cache/readme", { repo: input.doName, ref: shortBranch })),
  cacheDeleteJSON(buildCacheKeyFrom(input.cacheCtx.req, "/_cache/tree", { repo: input.doName, ref: shortBranch, path: "" })),
  ```
  1. CLI `git push` (`handleReceivePackPOST`) touches D1 `updatedAt` (cache-busting `overview.ts:148,262`) but never purges `/_cache/refs`, `/_cache/tree`, or `/_cache/commits`.
  2. `/_cache/refs` omits `version` in `git.ts:125`, `adminPage.ts:30`, `refsApi.ts:14`, and `commitFile.ts:297` (whereas `overview.ts:148,262` keys `/_cache/refs` WITH `v: String(updatedAt)`).
  3. `/_cache/tree` (`tree.ts:66-70`, 60s TTL; `overview.ts:309-313`, 120s TTL) and `/_cache/commits` (`commits.ts:72-78`, **300s TTL on mutable branch refs!**) omit repo version completely.
  4. `commitFile.ts:300-322` deletes `/_cache/readme` & `/_cache/tree` using `ref: shortBranch`, whereas `overview.ts:292,311,335,348` stores them under `ref: targetOid` (40-hex commit SHA), and `commitFile.ts` never deletes `/_cache/owner-profile-readme` or `/_cache/commits`.
- **Impact (Production & Public Repos):** After pushing via `git push` or committing via web editor, anonymous/public visitors continue seeing stale branches/commits/trees/READMEs for 60–300 seconds, and `ls-refs` / `api/refs` can serve stale refs for up to 60s.
- **Fix:** Pass `v: String(route.updatedAt)` (already available on `RepositoryRoute` / D1) into all `/_cache/refs`, `/_cache/tree`, `/_cache/readme`, `/_cache/owner-profile-readme`, and `/_cache/commits` cache keys for mutable refs, and purge/advance version consistently on both CLI push and web commits.

---

#### BUG-08: Inline Web Editor on Tag Refs Silently Creates an Orphan Branch (`refs/heads/<tag>`)

- **Files:**
  - `src/worker/routes/ui/blob.ts:123-131` (`handleBlob`)
  - `src/worker/git/commitFile.ts:162-175` (`commitRepositoryFile`)
- **Evidence:**
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
  ```
  ```ts
  // src/worker/git/commitFile.ts:162-169
  const requestedTarget = input.targetRef || headAndRefs.head.target || "refs/heads/main";
  const branchRef = requestedTarget.startsWith("refs/heads/")
    ? requestedTarget
    : `refs/heads/${requestedTarget.replace(/^refs\/[^/]+\//, "")}`;

  const existingRef = headAndRefs.refs.find((ref) => ref.name === branchRef);
  const oldOid = existingRef?.oid || zeroOid();
  ```
- **Impact:** When viewing a file on a tag (`?ref=v1.0.0` or `?ref=refs/tags/v1.0.0`), the UI enables the inline Edit button (`canEditFile: true`). Saving rewrites `branchRef` to `refs/heads/v1.0.0`, fails to find a matching branch, leaves `parentTreeOid = null` (`hasParentCommit = false`), and creates an unparented single-file orphan branch containing only the edited file.
- **Fix:** Restrict `canEditFile` in `blob.ts` to actual branches (`!ref.startsWith("refs/tags/")` and verify against branch refs), and in `commitFile.ts` reject `refs/tags/*` (or verify `branchRef` resolves to a known branch or default HEAD) with `400` instead of fabricating an orphan branch.

---

#### BUG-09: D1 Schema Split-Brain Between Drizzle Migrations and Ad-Hoc Runtime DDL

- **Files:**
  - `drizzle/d1/0000_gray_supernaut.sql:1-80`
  - `src/worker/db/d1/dal/adminDirectory.ts:50, 98, 126`
  - `src/worker/db/d1/dal/tokens.ts:101`
  - `src/worker/db/d1/dal/workspaceMeta.ts:49, 58, 77`
  - `src/worker/db/d1/bootstrap.ts:12-111`
- **Evidence:** `wrangler.jsonc:62` configures `migrations_dir: "drizzle/d1"` and `package.json:10` runs `wrangler d1 migrations apply git-on-cloudflare --remote` before `wrangler deploy`. However, `drizzle/d1/0000_gray_supernaut.sql` defines only 7 tables (`users`, `namespaces`, `namespace_memberships`, `repositories`, `personal_access_tokens`, `pat_namespace_grants`, `pat_repo_grants`), omitting `namespace_directory_meta`, `pat_global_grants`, `namespace_profile_meta`, and `repository_meta`, which are instead lazily created/altered on hot paths via `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE`.
- **Impact:** Schema state is fragmented across ad-hoc SQL helpers (`d1/schema.ts` + Drizzle migrations do not represent the real database), adding per-request DDL latency/race risk on cold Workers and preventing clean `drizzle-kit` schema management.
- **Fix:** Add `namespace_directory_meta`, `pat_global_grants`, `namespace_profile_meta`, and `repository_meta` to `src/worker/db/d1/schema.ts`, generate a formal Drizzle D1 migration (`npm run db:generate:d1`), update `bootstrap.ts` for tests, and remove runtime DDL probes.

---

#### BUG-10: Failing Integration Test (`github-feel.worker.test.ts`), Failing Root `tsc --noEmit`, and Crashing Node Unit Tests

- **Files & Command Output Evidence:**
  1. `test/github-feel.worker.test.ts:254-267` vs `src/client/pages/HomePage.tsx:53,61` & `src/client/islands/home-repos.tsx:392,708`:  
     Running `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts` fails (`GHF_EXIT=1`) at line `254`:
     ```text
     expect(anonHomeHtml).toContain("Vib Tools · Official Open-Source &amp; Engineering Forge");
     ```
     Actual rendered SSR output now emits `"Vib Tools · Open-Source Forge"` (`HomePage.tsx:53`), `"Pinned Repositories"` (`home-repos.tsx:392`), `"Organization"` (`home-repos.tsx:708`).
  2. `npx tsc --noEmit` (`tsconfig.json`) fails (`ROOT_TSC_EXIT=2`) with **10 errors**:
     - `src/worker/registry/index.ts(5,15): error TS2307: Cannot find module './owner'` (dead barrel export; `./owner` file does not exist).
     - `src/worker/auth/adminAuth.ts(92,24): error TS2339: Property 'PROD' does not exist on type 'ImportMetaEnv'` (`tsconfig.json` excludes `"vite/client"` types).
     - `src/shared/admin/globalPatPolicy.test.ts`, `pinning.test.ts`, `primaryAdminPolicy.test.ts`, `src/shared/web/theme.test.ts`: 8 errors (`TS2591` missing `node` types for `node:test`/`node:assert/strict`, plus `TS7006` implicit `any` parameter `t`).
  3. `npm run test` (`vitest.unit.config.ts`) fails (`UNIT_EXIT=1`) with **5/14 suites crashing at import**:  
     `pack-ref-index.test.ts`, `ofs-delta-encode.test.ts`, `ofs-delta-known-encodings.test.ts`, `parse-fetch-args.test.ts`, `upload-pack-acks.test.ts` fail with:
     ```text
     Error: Cannot find package 'cloudflare:workers' imported from /app/applet/src/worker/git/pack/indexer/resolve/index.ts:19:1
     ```
- **Impact:** `npm run test` and root `npx tsc --noEmit` cannot pass CI gates, and the main UI showcase worker test (`github-feel.worker.test.ts`) fails out of the box.
- **Fix:** Remove dead `src/worker/registry/index.ts` (or point appropriately), add `"vite/client"` / `@types/node` or isolate `src/**/*.test.ts` from root `tsconfig.json`, lazy-import or inject `cloudflare:workers` `exports` out of `indexer/resolve/index.ts` (so pure unit tests stay runtime-agnostic), and align `HomePage.tsx`/`home-repos.tsx` & `github-feel.worker.test.ts`.

---

#### BUG-11: D1 Sessions Consistency Cookie (`__Host-goc-d1-bm`) Lacks `secure: true` & Embedded-Iframe Attributes (`SameSite=None; Partitioned`)

- **Files:**
  - `src/worker/routes/d1Bookmark.ts:28-33`
  - Contrast with `src/worker/auth/cookies.ts:17-23`
- **Evidence:**
  ```ts
  // src/worker/routes/d1Bookmark.ts:28-33
  const D1_BOOKMARK_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: D1_BOOKMARK_COOKIE_MAX_AGE_SECONDS,
    prefix: D1_BOOKMARK_COOKIE_PREFIX, // "host" -> __Host-goc-d1-bm
  } as const satisfies CookieOptions;
  ```
  Unlike `SHARED_COOKIE_OPTIONS` in `cookies.ts:17-23` (`secure: true, sameSite: "None", partitioned: true`), `D1_BOOKMARK_COOKIE_OPTIONS` omits `secure: true` (risking rejection of `__Host-` prefix by browsers that validate `Secure` attribute on `Set-Cookie`) and uses `sameSite: "Lax"` without `partitioned: true`.
- **Impact:** In third-party embedded previews or read-replicated D1 deployments across sites, `__Host-goc-d1-bm` is blocked by the browser, breaking D1 sequential read-your-writes consistency (users may create a repo/token/user and not see it immediately on redirect/reload).
- **Fix:** Align `D1_BOOKMARK_COOKIE_OPTIONS` with `SHARED_COOKIE_OPTIONS` (`secure: true`, `sameSite: "None"`, `partitioned: true`, `httpOnly: true`, `prefix: "host"`).

---

### Medium Severity

#### BUG-12: 16 Native `window.alert` / `confirm` / `prompt` Dialogs Break Actions Inside Embedded Iframes

- **Files:**
  - `src/client/islands/repo-admin/useRepoAdminActions.ts:44, 52, 57, 67, 77, 84, 90, 108, 113, 117, 129, 134` (12 calls)
  - `src/client/islands/repo-admin/JsonResult.tsx:14` (1 call)
  - `src/client/islands/repo-admin/RepoOverviewCard.tsx:38` (1 call)
  - `src/client/islands/repositories.tsx:142` (`confirm(...)`)
  - `src/client/islands/tokens.tsx:216` (`confirm(...)`)
- **Evidence:** Directly verified via `grep` and file inspection; e.g. `useRepoAdminActions.ts:108,117`:
  ```ts
  const confirmation = window.prompt(`This action will PERMANENTLY DELETE...`);
  ...
  if (!window.confirm("Final confirmation: Delete this repository forever?")) { return; }
  ```
- **Impact:** Sandboxed iframes (including AI Studio Preview and strict embedded webviews) suppress `window.alert`/`confirm`/`prompt`, causing destructive/critical actions like Repo Purge, Remove Pack, Clear Compaction, Visibility Toggle, and PAT Revoke to silently abort or fail without feedback.
- **Fix:** Replace all 16 native browser dialogs with inline React confirmation modals and inline status/error banners (matching the existing pattern in `RepositoriesSection.tsx:88-101`).

---

#### BUG-13: Non-Atomic Multi-Step DO Storage Commits & Warm DO State Leaks (`clearRepositoryStorage`, `finalizeReceiveState`, `commitCompactionState`)

- **Files:**
  - `src/worker/do/repo/packOperations.ts:168-183` (`clearRepositoryStorage`) & `src/worker/do/repo/repoDO.ts:75-85`
  - `src/worker/do/repo/catalog/receive.ts:116-142` (`finalizeReceiveState`)
  - `src/worker/do/repo/catalog/compaction/lease.ts:205-235` (`commitCompactionState`)
- **Evidence:**
  1. `clearRepositoryStorage` executes `await ctx.storage.deleteAll()` (`packOperations.ts:179`) without resetting `lastAccessMemMs` on the live `RepoDurableObject` or re-running Drizzle SQLite migrations (`repoDO.ts:79-80` runs `migrate(db, migrations)` only in `constructor()`). If a warm DO instance receives traffic immediately after purge/clear without evicting, SQLite tables are gone.
  2. `finalizeReceiveState` (`receive.ts:116-142`) and `commitCompactionState` (`lease.ts:205-235`) mix separate SQLite row mutations and 4–5 KV `store.put`/`store.delete` calls without `ctx.storage.transaction(...)` (or `transactionSync` on SQLite+KV).
- **Impact:** Mid-flight exceptions or DO preemption between awaits can leave SQLite pack catalog, `nextPackSeq`, `refs`, `head`, `packsetVersion`, or leases out of sync; post-purge warm DO access risks missing-table failures until DO eviction.
- **Fix:** Wrap state transitions in `ctx.storage.transaction(...)` and call SQLite migration re-initialization + reset `lastAccessMemMs` in `RepoDurableObject` after `deleteAll()`.

---

#### BUG-14: Incomplete Push Connectivity Validation (`runPackConnectivityCheck`) & Tag-Peel Edge Case in `readPath`

- **Files:**
  - `src/worker/git/pack/indexer/connectivity.ts:159-185` (`runPackConnectivityCheck`)
  - `src/worker/git/operations/read/tree.ts:41-46` (`readPath`)
- **Evidence:**
  ```ts
  // src/worker/git/pack/indexer/connectivity.ts:160-175
  case "commit": {
    if (!kind.tree || !(await hasObject(kind.tree))) { ... }
    for (const p of kind.parents) {
      if (!(await hasObject(p))) { ... }
    }
    break;
  }
  ```
  ```ts
  // src/worker/git/operations/read/tree.ts:41-46
  } else if (startObj.type === "tag") {
    const t = parseTagTarget(startObj.payload);
    if (!t || !t.targetOid) throw new Error("Unsupported object type");
    const target = t.targetOid;
    const { tree } = await readCommit(env, repoId, target, cacheCtx);
    currentTreeOid = tree;
  ```
- **Impact:** `runPackConnectivityCheck` validates only commit existence, root tree existence, and immediate parent commit existence—it never walks nested trees/blobs or ancestor closure. Meanwhile, `readPath` crashes on nested annotated tags (`tag -> tag -> commit`) or tags pointing directly to a `tree` or `blob` (whereas `connectivity.ts:127-143` properly loops with `unwrapTag`).
- **Fix:** Add bounded/memoized tree+blob reachability checking for newly pushed pack objects in `connectivity.ts`, and replace lines `41-46` in `read/tree.ts` with recursive tag unwrapping supporting commit, tree, and blob targets.

---

#### BUG-15: `commitRepositoryFile` Leaks Receive Lease on Non-Committed Finalize & Orphans Staged R2 Pack on Failure

- **File:** `src/worker/git/commitFile.ts:242-291, 335-345`
- **Evidence:**
  ```ts
  // src/worker/git/commitFile.ts:281-291
  if (finalized.status !== "committed") {
    input.log.warn("web-commit:finalize-non-committed", ...);
    return { ok: false, reason: "commit-failed", detail: `Finalize status: ${finalized.status}` };
  }
  ```
  Neither the `finalized.status !== "committed"` branch (`:281-291`) nor the `catch` block (`:335-345`) deletes the staged R2 pack/idx/refs uploaded at `:242-264`, and `:281-291` omits `stub.abortReceive(token)`.
- **Impact:** Concurrent web commits hitting `ref_conflict` hold the receive lease until alarm expiry (blocking pushes) and leave orphaned `.pack`/`.idx`/`.refs` objects in R2.
- **Fix:** Call `abortReceive(token)` whenever `finalized.status !== "committed"`, and best-effort delete `packKey`, `packIndexKey(packKey)`, and `packRefsKey(packKey)` on any aborted/failed staged pack.

---

#### BUG-16: Missing Auth Brute-Force Rate Limiting & Permissive `x-forwarded-host` / Proto Fallback in `isAllowedOrigin`

- **Files:**
  - `src/worker/routes/authLogin.ts:227-375` (`POST /auth/login`, `POST /auth/api/change-password`)
  - `src/worker/auth/origin.ts:38-52` (`isAllowedOrigin`)
- **Evidence:** Neither `/auth/login` nor `/auth/api/change-password` tracks failed attempts or enforces lockout/backoff (making 100k-iteration PBKDF2 both brute-forceable on weak passwords and a Worker CPU amplification vector). In `origin.ts:46-52`:
  ```ts
  for (const candidateHost of [forwardedHost, host]) {
    if (!candidateHost) continue;
    if (originUrl.host.toLowerCase() !== candidateHost.toLowerCase()) continue;
    if (originUrl.protocol === effectiveProto || originUrl.protocol === "https:") {
      return true;
    }
  }
  ```
- **Impact:** Unchecked header trust allows an attacker behind misconfigured proxies to supply matching `Host`/`X-Forwarded-Host` and always accepts `https:` origins even on plain `http:` requests; lack of rate-limiting exposes login endpoints to credential stuffing.
- **Fix:** Add Cloudflare Rate Limiting binding or D1/DO attempt throttling on auth endpoints, and tighten `isAllowedOrigin` against configured canonical origins or exact protocol parity.

---

#### BUG-17: Broken Sidebar Links (`/admin#tokens`, Legacy `/auth/account`) & Unhighlighted Active Routes

- **Files:**
  - `src/client/components/Sidebar.tsx:24, 94`
  - `src/shared/admin/panel.ts:537-557` (`resolveActiveSidebarItem`)
- **Evidence:**
  ```tsx
  // src/client/components/Sidebar.tsx:24, 94
  { key: "account", label: "Account", href: "/auth/account", icon: User },
  ...
  const tokensHref = isAdmin ? "/admin#tokens" : "/auth/account#tokens";
  ```
  `/admin` (`SystemAdminPage` overview) renders no element with `id="tokens"`; admin PAT management moved to `/admin/tokens`, and user settings moved to `/user/account` and `/user/settings/tokens` (`authTokens.ts:98-106`). Additionally, `resolveActiveSidebarItem` (`panel.ts:537-557`) returns `null` for `"system-admin-repositories"`, `"system-admin-tokens"`, `"system-admin-settings"`, and `"system-admin-security"`.
- **Impact:** Clicking "Manage access tokens" in the sidebar as Admin lands on `/admin` overview instead of `/admin/tokens`, and navigating via sidebar loses active state highlighting on 4 of 6 `/admin/*` pages.
- **Fix:** Update `Sidebar.tsx` links to `/admin/tokens` (admin) and `/user/account` / `/user/settings/tokens` (users), and map all `"system-admin-*"` views in `resolveActiveSidebarItem`.

---

#### BUG-18: System Admin Truncates Real Default Branches After 24 Repos & `/admin/tokens` Omits Other Users' PATs

- **File:** `src/worker/routes/systemAdmin.ts:152-186` (`loadSystemAdminData`)
- **Evidence:**
  ```ts
  // src/worker/routes/systemAdmin.ts:155, 170-173
    listPatsForUser(db, viewer.userId),
  ...
    const defaultBranch =
      index < 24 ? await resolveDefaultBranch(c.env, limiter, row.doName) : "main";
  ```
- **Impact:** In Production instances with >24 repositories, repository #25+ incorrectly displays `defaultBranch: "main"` regardless of its true `HEAD`. Furthermore, `/admin/tokens` only displays/manages tokens owned by the logged-in admin, giving administrators zero visibility to audit or revoke PATs belonging to other directory users (critical after `BUG-02` or incident response).
- **Fix:** Store/cache default branch name in `repository_meta` (updated on `HEAD`/receive changes) instead of 24-cap DO fan-out, and add a workspace-wide admin PAT audit/revoke view on `/admin/tokens` while keeping creation cleanly scoped.

---

#### BUG-19: Hardcoded Third-Party Branding (`Vib Tools` / `git.vibtools.io`), Fake Status Link & Non-Configurable "Settings Control Panel"

- **Files:**
  - `src/client/components/header.tsx:41-43, 85` (`"Vib Git"`, `"git.vibtools.io"`, `"https://docs.vib.tools"`)
  - `src/client/components/footer.tsx:5, 8, 16, 23-24` (`"© 2026 Vib Tools"`, `"https://vibtools.io"`, `"Status"` -> `/explore`)
  - `src/client/pages/HomePage.tsx:53, 61, 71, 93` & `src/client/islands/home-repos.tsx:426, 710-741, 813, 827` (`"support@vibtools.io"`, `"https://git.vibtools.io/<ns>/<repo>.git"`, `"Vib Tools Workspace"`)
  - `wrangler.jsonc:10-18` (hardcoded custom domains `git-on-cloudflare.com`, `git.vibtools.io`)
  - `src/client/pages/AdminSettingsPage.tsx:42-190`
- **Evidence:** Production builds continue rendering third-party `"Vib Tools"` branding, `git.vibtools.io` clone URLs (ignoring actual request `origin` in `home-repos.tsx:813`), external docs/marketing links, and a footer `"Status"` link pointing to `/explore`. Meanwhile `/admin/settings` ("Settings Control Panel") renders strictly read-only `<dl>` telemetry with zero editable settings.
- **Impact:** Unready for white-label/independent Production deployment; confuses users with dead/wrong clone hostnames (`git.vibtools.io`) and deceptive navigation ("Status" -> Explore, "Control Panel" with no controls).
- **Fix:** Externalize branding/site identity into instance configuration/D1 settings (editable in `/admin/settings`), use dynamic `origin` in `home-repos.tsx:813`, remove or fix the fake `"Status"` link, and clarify `/admin/settings` UI.

---

#### BUG-20: Broken `/tree` Fallback for Binary/Large Files & JSON API Endpoints Returning HTML Error Pages

- **Files:**
  - `src/worker/routes/ui/tree.ts:174-207` (`handleTree` blob branch)
  - `src/worker/routes/ui/commits.ts:141-251` (`handleCommitFragments`, `handleCommitDiff`)
- **Evidence:**
  1. `ui/tree.ts:174-207`: When `readPath` resolves to a blob under `/:owner/:repo/tree?path=<file>`, the handler skips `tooLarge`, `detectBinary`, `isImage`, `isPdf`, `isMarkdown`, `breadcrumbs`, `parentHref`, and `canEditFile`, calling `bytesToText(result.content)` even on binary payloads.
  2. `ui/commits.ts:146,149-155,188-193` and `:201,204-219,244-250`: Both JSON endpoints call `resolveUiRepoAccess(c, owner, repo, { responseShape: "json" })` yet return HTML error pages (`badRequest(...)` and `handleError(...)`) on invalid OID/path or runtime errors.
- **Impact:** Viewing a file via `/tree?path=...` garbles binary/image/PDF/oversized files; client-side diff/merge-commit expanders crash JSON parsing (`response.json()`) whenever backend validation or Git read fails.
- **Fix:** Delegate blob results in `handleTree` cleanly to `handleBlob` logic (or share a unified blob presenter), and return JSON `{ error }` responses with `400`/`404`/`500` status codes in `handleCommitFragments` and `handleCommitDiff`.

---

### Low Severity

#### BUG-21: Misleading Cryptographic Copy on `/admin/security`

- **File:** `src/client/pages/AdminSecurityPage.tsx:203-209` vs `src/worker/auth/session.ts:15-90`
- **Evidence:** `AdminSecurityPage.tsx:204` displays `HMAC-signed · HttpOnly · Secure · Partitioned · SameSite=None`, whereas `session.ts:15, 79-89` actually encrypts and authenticates cookies using HKDF-SHA256 + **AES-256-GCM**.
- **Impact:** Inaccurate security documentation in the Admin Security UI.
- **Fix:** Update UI copy to `"AES-256-GCM encrypted (HKDF-SHA256)"`.

---

#### BUG-22: Directory Lookup Nondeterminism, Swallowed Error & Role Upsert Race

- **Files:**
  - `src/worker/db/d1/dal/adminDirectory.ts:302-306` (`findDirectoryAccountByUserId` lacks deterministic `ORDER BY`)
  - `src/worker/db/d1/dal/adminDirectory.ts:410-416` (`updateNamespaceHandle` empty `catch {}` hides `users.tessera_sub` collision errors)
  - `src/worker/routes/authLogin.ts:406-420` (`PUT /auth/api/profile` reads `existingMeta` then overwrites `role`/`status`, risking race with concurrent Admin role/status changes)
- **Impact:** Rare metadata inconsistencies during concurrent admin/profile edits or multi-namespace ownership.
- **Fix:** Add `orderBy(asc(namespaces.createdAt), asc(namespaces.id))` in `findDirectoryAccountByUserId`, log errors in `updateNamespaceHandle`, and make profile display-name updates patch only `display_name` + `updated_at` in SQL.

---

#### BUG-23: Prettier Check Fails (`FMT_EXIT=1`) & Vitest Config Deprecation Warnings

- **Files:** `.prettierignore`, `vitest.config.ts:5,46`, `vitest.unit.config.ts:8`
- **Evidence:** `npm run format:check` exits `1` due to `.aistudio/artifacts/...` and `.playwright-cli/...` files not being listed in `.prettierignore` (`src/` and `test/` have zero formatting errors). Vitest 4.1 / Vite 8 emits warnings on `__dirname` and extensionless import `./test/vitest.bindings`.
- **Fix:** Ignore `.aistudio/` and `.playwright-cli/` in `.prettierignore` and replace `__dirname` with `import.meta.dirname`.

---

## 5. Recommended Phased Remediation Roadmap (For Future Implementation)

1. **Phase 1 — Critical Security & Access Control Hardening:** Fix `BUG-01` (enforce `canWriteRepositories` on repo admin UI/API), `BUG-02` (enforce active status & role on scoped PAT verification), `BUG-03` (fail-closed D1 fallback), `BUG-04` (SVG XSS + `Content-Disposition` escaping), and `BUG-11` (`d1Bookmark` cookie flags).
2. **Phase 2 — Data Integrity, Atomic Deletions & D1 Migrations:** Fix `BUG-05` (route all System Admin repo & user deletions through `repository-delete` queue + fix cross-namespace delete 403), `BUG-06` (cross-namespace admin create/PAT parity), and `BUG-09` (consolidate ad-hoc D1 tables into formal Drizzle migrations).
3. **Phase 3 — Git Engine, Caching & DO Lifecycle Reliability:** Fix `BUG-07` (versioned `/_cache/*` keys & post-push/web-commit invalidation), `BUG-08` (block tag editing -> orphan branch), `BUG-13` (DO transaction atomicity + warm DO re-migration), `BUG-14` (full connectivity & recursive tag unwrapping), and `BUG-15` (staged R2 & lease cleanup on error).
4. **Phase 4 — UI/UX, Embedded Iframe Compatibility & Production White-Labeling:** Fix `BUG-12` (replace 16 native dialogs with React modals/notices), `BUG-17` (sidebar routes & active highlights), `BUG-18` (24-repo default branch limit & admin PAT audit), `BUG-19` (configurable branding/settings & dynamic clone origin), `BUG-20` (`/tree` blob fallback & JSON error responses), `BUG-16` (auth rate-limiting & strict origin validation), and `BUG-21` / `BUG-22`.
5. **Phase 5 — Build, Typecheck, Tests & CI Hygiene:** Fix `BUG-10` (root `tsc --noEmit`, `cloudflare:workers` unit-test decoupling, and `github-feel.worker.test.ts`) and `BUG-23` (`.prettierignore` & Vitest ESM cleanup), then run full `npm run typecheck`, `npm run test`, `npm run test:auth`, `npm run test:workers`, and `npm run build`.
