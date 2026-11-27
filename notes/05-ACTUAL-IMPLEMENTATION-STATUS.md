# 05 · Actual Implementation Status Ledger

Truth ledger distinguishing what is **actually working in Production**, what is **Demo-only**, and what is **broken, simulated, or missing** at the frozen baseline (`2026-11-26`), plus phase tracking.

---

## 1. Currently Working Features (Verified at Baseline)

| Domain                               | Feature                                                                                                                                                                                                                                                                                                               | Runtime Verification Proof                                                                                                                                                                                                                         | Parity Note                                                |
| :----------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- |
| **Git Smart HTTP v2 & Legacy Fetch** | `GET /info/refs`, `POST /git-upload-pack` (`ls-refs`, streaming `fetch`, legacy v0/v1 `want`/`have` fallback, inline `.refs` backfill without Queue), `POST /git-receive-pack` (streaming pack ingest, lease lock, synchronous post-push cache/D1 sync)                                                               | `src/worker/routes/git.ts`, `streamReceivePack.ts`, `uploadStream/index.ts`, `fetch/plan.ts`, `tasks/refBackfill.ts`, verified by `test:workers`                                                                                                   | **Phase 02 Complete (`F-09`, `F-17`, `F-19` resolved)**    |
| **Auth Core**                        | PBKDF2-SHA256 (`100k` iter, 16B salt) verification, AES-GCM-256 `goc_sess_` sealed cookies with `sessionEpoch` revocation, atomic `/auth/setup` D1 batching, canonical D1 primary-admin resolution, adaptive HTTPS/HTTP cookies, isolate+KV rate limiting, same-origin CSRF checks, PAT generation/scoping/revocation | `src/worker/auth/{adminAuth,session,cookies,rateLimit,pat,origin}.ts`, `authLogin.ts`, `authTokens.ts`, verified by `test:auth`, `admin-auth.test.ts`, `auth-session.worker.test.ts`, `auth-production-setup.worker.test.ts`                       | **Phase 01 Complete (`F-02`–`F-08` resolved)**             |
| **Control-Plane CRUD**               | User creation/edit/disable/delete, Namespace rename & KV cache cleanup, Repo create/visibility/description/pin/`homePinned`/delete, Site Branding CRUD + R2 logo/favicon/og uploads, `/profile/admin` footer routing, request-scoped cold branch lookup + `"..."` overflow indicator                                  | `src/worker/routes/{systemAdmin,authRepositories}.ts`, `src/worker/db/d1/dal/`, `src/client/components/footer.tsx`                                                                                                                                 | **Phase 01 & Phase 02 Complete (`F-01`, `F-18` resolved)** |
| **Repo Code Browser & Metadata**     | SSR overview, directory tree, syntax-highlighted blob view, commit list, merge commit expansion, commit diff inspection, markdown README rendering, real server/KV-derived language/license/version metadata, `rawpath` direct-open & forwarded-host guard                                                            | `src/worker/routes/ui/{overview,tree,blob,commits,raw}.ts`, `src/worker/repositories/repoMetadata.ts`, `src/shared/web/rawHotlink.ts`, `src/client/pages/*`                                                                                        | **Phase 03 Complete (`F-11`, `F-16` resolved)**            |
| **Web Git Editing & Refs**           | Create README/file/folder, upload text/binary files (`POST .../file/upload`), edit, rename/move (`POST .../file/move`), delete (`DELETE .../file`), create/delete branches & tags (`POST`/`DELETE .../admin/refs`), configurable author commit email (`commit_email`)                                                 | `src/worker/git/commitFile.ts`, `authRepositories.ts`, `admin.ts`, `authTokens.ts`, `blob-editor.tsx`, `repo-overview-actions.tsx`, `profile-settings.tsx`                                                                                         | **Phase 03 Complete (`F-12` resolved)**                    |
| **Repo DO & Pack Tools**             | Pack catalog inspection, OID/Commit debug inspection, stale pack removal (`DELETE /admin/pack/:key`), repo purge (`DELETE /admin/purge`), queue-guarded & Free-tier CPU-budgeted compaction                                                                                                                           | `src/worker/routes/admin.ts`, `src/worker/do/repo/repoDO.ts`, `src/worker/do/repo/catalog/compaction/*`, `compactionCard.tsx`                                                                                                                      | **Phase 02 Complete (`F-10` resolved)**                    |
| **UI System, Toast & PWA**           | Flat zero-radius (`--radius: 0rem`) UI primitives (`@/client/components/ui`), Segoe/Helvetica font stack, global `ToastViewport` / `showToast` / `copyToClipboard`, `/manifest.webmanifest`, `/sw.js`, PNG/SVG install icons & footer PWA online/install control                                                      | `src/client/styles/app.css`, `src/client/components/ui/{toast,pwa-install}.tsx`, `src/shared/{toast,pwa}.ts`, `public/{manifest.webmanifest,sw.js,icons/*}`, verified by `phase04-ui-pwa.node-test.ts`, `phase04-pwa-ui.worker.test.ts` & Chromium | **Phase 04 Complete (`F-13`–`F-15` resolved)**             |
| **Deploy Automation**                | D1/KV/R2/Queue resource creation & ID resolution, Free vs Paid Wrangler config synthesis, idempotent D1 migrations, `SESSION_SECRET`-only pre-deploy reconciliation & atomic `--secrets-file` upload                                                                                                                  | `scripts/cf-auto-deploy.mjs`, `cf-auto-deploy-lib.mjs` (`10/10` node tests + `--dry-run` pass)                                                                                                                                                     | **Phase 05 Complete (`F-20` resolved)**                    |

---

## 2. Demo-Mode-Only Features (Compiled / Gated Out in Production)

| Feature                                                            | How Separated                                                                              | Production Behavior                                                            |
| :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **`POST /auth/demo-login`** (`admin` & `alex-dev` 1-click sign-in) | `if (import.meta.env.PROD \|\| !isDemoModeEnabled(c.env)) return 403` (`authLogin.ts:708`) | Compiled out & returns `403` in Production                                     |
| **Quick Demo Login UI Card & Test Credentials Display**            | `showDemoUi = !import.meta.env.PROD && demoMode` (`AuthSignInPage.tsx:49,179-221`)         | Stripped cleanly from `/auth` in Production                                    |
| **Lazy Workspace Seeding (`ensureDemoTestUserSeeded`)**            | `if (import.meta.env.PROD) return` (`index.ts:61,75,170,218`, `authLogin.ts:349`)          | Never executes in Production (`users` starts empty for `/auth/setup`)          |
| **Default Demo Password Fallback (`admin123`)**                    | Blocked when `import.meta.env.PROD` or `AUTH_MODE=production` (`adminAuth.ts:153-159`)     | Fails closed (`password: null`) until `/auth/setup` or `ADMIN_PASSWORD` secret |

---

## 3. Resolved Findings vs. Remaining Active Backlog

### Resolved in Phase 01 (`F-01`–`F-08`)

1. ~~**Footer `Profile` link (`F-01`)**~~ — **FIXED (`Phase 01`):** `footer.tsx` now routes via `buildNamespaceProfileHref(viewer.primaryNamespaceSlug)` (`/profile/admin` for `@admin`) and `test/demo-user-mock-repo.worker.test.ts` passes cleanly.
2. ~~**Production `/auth/setup` Custom Handle (`F-02`)**~~ — **FIXED (`Phase 01`):** Canonical `resolvePrimaryAdminUser` & `resolvePrimaryAdminNamespace` resolve the earliest D1-claimed admin when `ADMIN_PASSWORD` is unset across `session.ts`, `pat.ts`, `authLogin.ts`, `systemAdmin.ts`, `index.ts`, and `ui/overview.ts`.
3. ~~**D1 Primary Admin Password Management (`F-03`)**~~ — **FIXED (`Phase 01`):** `passwordManagedByEnv` unlocks `/user/settings/security` and `/admin/users` password changes when `ADMIN_PASSWORD` is unset while keeping primary admin role/status/delete locked.
4. ~~**Atomic `/auth/setup` (`F-04`)**~~ — **FIXED (`Phase 01`):** Executed in a single `c.env.DB.batch([...])` with `WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1)`.
5. ~~**Session Revocation on Password Rotation (`F-05`)**~~ — **FIXED (`Phase 01`):** `session_epoch` column added to `namespace_directory_meta` and validated inside `loadViewerUncached`; bumped on password change/reset and account disable.
6. ~~**Accurate Auth Source Labels (`F-06`)**~~ — **FIXED (`Phase 01`):** `resolveAdminAuthSource(env)` distinguishes `"demo" | "env" | "d1"` across `/admin/settings`, `/admin/security`, and `/user/settings`.
7. ~~**Atomic/Resilient Rate Limiting (`F-07`)**~~ — **FIXED (`Phase 01`):** Isolate-local synchronous counter map (`localRateLimitStates`) merged with `ROUTES` KV and structured degraded-mode logging.
8. ~~**HTTP Plain-LAN Auth Cookies (`F-08`)**~~ — **FIXED (`Phase 01`):** `isHttpsSessionContext` issues `__Host-goc_session` on HTTPS and `goc_session` (`SameSite=Lax; Path=/; secure: false`) on plain HTTP.

### Resolved in Phase 02 (`F-09`, `F-10`, `F-17`, `F-18`, `F-19`)

9. ~~**Queue-less Incremental `git fetch` (`F-09`)**~~ — **FIXED (`Phase 02`):** Bounded inline `.refs` sidecar repair (`backfillPackRefsInline`) runs and reloads `loadPackRefView` immediately when `REPO_TASKS_QUEUE` is unbound.
10. ~~**Queue-less / Free-Tier Compaction (`F-10`)**~~ — **FIXED (`Phase 02`):** Manual compaction returns HTTP `409` (`queues-required` or `free-tier-budget-exceeded`) without leaving orphaned `compactionWantedAt` flags; Free-tier alarm re-arming respects `exceedsFreeTierCompactionBudget`.
11. ~~**Git Smart HTTP v0/v1 Clients (`F-17`)**~~ — **FIXED (`Phase 02`):** `handleUploadPackPOST` accepts legacy v0/v1 `want`/`have` upload-pack fetch bodies when `Git-Protocol: version=2` is omitted and returns explicit `400` on invalid empty bodies.
12. ~~**60+ Repo Admin Listing (`F-18`)**~~ — **FIXED (`Phase 02`):** `systemAdmin.ts` uses request-scoped `c.var.limiter`, bounds cold DO branch lookups by subrequest headroom (`COLD_BRANCH_SUBREQUEST_HEADROOM = 100`), marks unresolved cold overflow repos with `"..."`, and warms KV in the background.
13. ~~**Reliable Post-Push Sync (`F-19`)**~~ — **FIXED (`Phase 02`):** `streamReceivePack.ts` awaits `runRepoStateChange` before `reportStatus`, purges KV/Cache via `Promise.allSettled`, and enqueues `dispatchRouteCacheSync` retry on D1 `touchRepositoryUpdatedAt` errors.

### Resolved in Phase 03 (`F-11`, `F-12`, `F-16`)

14. ~~**Real Repo Language/License/Version & Neutral Branding (`F-11`)**~~ — **FIXED (`Phase 03`):** Derived repository language, license, default branch, and version on the server with bounded KV caching (`repoMetadata.ts`), removed client slug-regex guesses and dummy `Python` dropdown injection (`home-repos.tsx`), removed `"Vib Tools"` fallbacks, and replaced brand defaults with neutral `gitra` / empty external URLs (`branding.ts`).
15. ~~**Web Binary Upload, Delete, Move, Branch/Tag UI & Configurable Commit Email (`F-12`)**~~ — **FIXED (`Phase 03`):** Extended `commitFile.ts` (`delete`, `move`, `Uint8Array`), added `POST .../file/upload`, `DELETE .../file`, `POST .../file/move`, `POST`/`DELETE /:owner/:repo/admin/refs`, wired `RepoOverviewActionsIsland`/`RepoRefsManagerIsland`/`BlobEditorIsland`/`TreePage`, and persisted optional `commit_email` in D1 (`0003_chief_stellaris.sql`) + `/user/profile`.
16. ~~**`rawpath` Direct Tab Open & Forwarded Proxy Support (`F-16`)**~~ — **FIXED (`Phase 03`):** `isRawPathRequestAllowed` (`rawHotlink.ts`, `raw.ts`) permits `Sec-Fetch-Site: none|same-origin` and matching `X-Forwarded-Host` / `Host` while still blocking cross-site hotlinks (`403`).

### Resolved in Phase 04 (`F-13`, `F-14`, `F-15`)

17. ~~**Global Toast System (`F-13`)**~~ — **FIXED (`Phase 04`):** Added global `ToastViewport` / `showToast` / `copyToClipboard` mounted in `entries/shell.ts`, eliminated silent clipboard catches & `console.warn`, replaced forced `window.location.reload()` timers in `useRepoAdminActions.ts`, and wired mutation feedback across interactive islands.
18. ~~**PWA Support (`F-14`)**~~ — **FIXED (`Phase 04`):** Added `/public/manifest.webmanifest`, `/public/sw.js` (bypassing auth/admin/user/api/Git Smart HTTP/HMR/mutations), 4 PNG + SVG install icons (`192`, `512`, `maskable-512`, `180`), SSR head tags in `document.tsx`, and footer `PwaInstallControl`.
19. ~~**Component-Only Flat Design (`--radius: 0rem`) (`F-15`)**~~ — **FIXED (`Phase 04`):** Locked `--radius: 0rem` + zeroed radius tokens, applied `"Segoe UI", "Segoe UI Web", ..., "Helvetica Neue", Helvetica, Arial, sans-serif`, stripped shadows and structural `rounded-*` across UI primitives/components/pages/islands (preserving 8px semantic language dots), and standardized `@/client/components/ui` primitives.

### Resolved in Phase 05 (`F-20`, `F-21`)

20. ~~**Deploy Secret Ordering & Hygiene (`F-20`)**~~ — **FIXED (`Phase 05`):** Reduced `REQUIRED_WORKER_SECRETS` to `["SESSION_SECRET"]`, added `buildSecretsUploadPayload` & `buildWranglerDeployArgs`, and wired `cf-auto-deploy.mjs` to plan secrets before deployment and upload pending secrets atomically with `wrangler deploy --secrets-file`.
21. ~~**Format Check & Bundle Bloat (`F-21`)**~~ — **FIXED (`Phase 05`):** Removed all 22 unreferenced `/public/assets/aistudio/` files from static assets, added `.prettierrc` `*.jsonc` override (`trailingComma: "none"`), and ran Prettier so `npm run format:check` exits `0`.

### Active Backlog

- _None — all 21 findings (`F-01`–`F-21`) are resolved._

---

## 4. Phase Completion Status Tracker

- **Baseline (Frozen):** Complete (`21` total findings across Phases `01`–`05`).
- **Phase 01 (`F-01`–`F-08`):** **COMPLETED (2026-11-26)** — all 8 findings fixed, audited, and verified.
- **Phase 02 (`F-09`, `F-10`, `F-17`–`F-19`):** **COMPLETED (2026-11-26)** — all 5 findings fixed, audited, and verified.
- **Phase 03 (`F-11`, `F-12`, `F-16`):** **COMPLETED (2026-11-26)** — all 3 findings fixed, audited, and verified.
- **Phase 04 (`F-13`–`F-15`):** **COMPLETED (2026-11-26)** — all 3 findings fixed, audited, and verified.
- **Phase 05 (`F-20`, `F-21`):** **COMPLETED (2026-11-26)** — both findings fixed, audited, and verified (`21 / 21` findings complete; `format:check` `0`, `typecheck` `0`, `test` `86/86`, `cf-auto-deploy` `10/10`, `cloudflare-tier` `6/6`, `phase04-ui-pwa` `4/4`, targeted worker suites `12/12` after full `357/357` pass, `build` PASS).
