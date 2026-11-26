# 05 — Actual Implementation Status Ledger

> **Purpose:** Baseline-frozen factual ledger contrasting (1) features genuinely working end-to-end right now in **Demo Mode** and **Production Mode**, (2) features currently broken, UI-only/read-only, hardcoded, or failing CI gates, and (3) what becomes production-operational after each Remediation Phase (`Phase 01`–`Phase 05`).

---

## Part 1 — Baseline Verified Working Features (As of Freeze `2026-11-26`)

### 1. Core Git Engine & Storage (Genuine Full-Stack Implementation)

- **Git Smart HTTP v2 Read/Fetch (`src/worker/routes/git.ts`, `uploadStream/index.ts`):** `GET /:owner/:repo/info/refs?service=git-upload-pack`, `ls-refs`, and streaming `fetch` (sideband-64k, delta resolution, gzip request body decoding) run end-to-end against `RepoDurableObject` + R2 packs.
- **Git Smart HTTP v2 Push (`src/worker/routes/git.ts`, `receive/pipeline.ts`, `RepoDO`):** Streaming `git-receive-pack` with single-writer DO leases (`beginReceive` / `finalizeReceive`, `503 Retry-After: 10` on contention), R2 staging, pass-1 scan, pass-2 delta resolution & `.idx` v2 + `.refs` sidecar creation.
- **Multi-Tier Compaction & Idle Cleanup (`RepoDurableObject`, `queue.ts`):** Background compaction and superseded-pack pruning run cleanly via `REPO_TASKS_QUEUE` (`compaction`, `compaction-delete`, `pack-ref-backfill`).
- **Repository SSR Browser UI (`overview.ts`, `tree.ts`, `blob.ts`, `commits.ts`, `raw.ts`):** Overview, code tree, branch/tag switcher, commit list, commit diff inspector, and Markdown rendering work end-to-end.

### 2. Authentication, Sessions & Multi-Tenant Workspace (Genuine Full-Stack)

- **Demo vs Production Runtime Switch (`src/worker/auth/adminAuth.ts`):** Production mode (`import.meta.env.PROD`, `AUTH_MODE=production`, or configured `ADMIN_PASSWORD`) genuinely locks down `/auth/demo-login` (`403`), hides demo buttons (`AuthSignInPage.tsx`), and disables public demo seeding (`src/worker/index.ts`).
- **Real User Sessions (`src/worker/auth/session.ts`, `cookies.ts`):** Encrypted via HKDF-SHA256 + AES-256-GCM inside `__Host-goc_session` (`HttpOnly; Secure; SameSite=None; Partitioned`).
- **Directory Password Auth (`src/worker/auth/passwords.ts`, `authLogin.ts`):** PBKDF2-SHA256 (`100,000` iterations, 16-byte random salt) verified on `/auth/login` and `/auth/api/change-password`.
- **PAT Lifecycle & Git HTTP Basic Auth (`src/worker/auth/pat.ts`, `gitAuth.ts`):** Genuine SHA-256 hashed `goc_<8hex>_<32base32>` tokens supporting repo, namespace, and admin-global (`All namespaces`) scopes over HTTPS Git Basic auth.
- **User Settings (`/user/profile`, `/user/account`, `/user/settings/tokens`):** Editing display name/bio/location/website, creating owned repos, toggling owned repo visibility, editing text files on valid branches (`commitRepositoryFile`), and minting/revoking owned PATs work end-to-end.

### 3. Phase 01 Completed Hardening (`BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`, `BUG-11` — ACTUAL WORKING)

- **Viewer Role Read-Only Enforcement (`src/worker/routes/ui/helpers.ts`, `adminPage.ts`):** `viewer` members receive `403 Forbidden` on `/:owner/:repo/admin` and JSON admin routes while keeping repo reads working with `canManageRepo: false`.
- **PAT & Session Revocation / Fail-Closed Enforcement (`src/worker/auth/pat.ts`, `session.ts`):** Disabling a user revokes browser sessions and repo/namespace/global PATs (`token-revoked`); demoting to `viewer` caps scoped PATs to `"pull"` only; D1 directory lookup errors fail closed (`null`) and missing directory rows default to `"viewer"`.
- **SVG XSS & Header Injection Protection (`src/worker/routes/ui/blob.ts`, `raw.ts`):** Binary `.svg` inline previews disabled; `/raw` and `/rawpath` enforce `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, `sanitizeContentDispositionFilename`, and `text/plain` + `attachment` for scriptable files.
- **Iframe D1 Bookmark Consistency (`src/worker/routes/d1Bookmark.ts`):** `__Host-goc-d1-bm` emits `Secure; SameSite=None; Partitioned` for embedded iframe read-after-write consistency.

### 4. Phase 02 Completed Integrity, Parity & Schema Hardening (`BUG-05`, `BUG-06`, `BUG-09` — ACTUAL WORKING)

- **Atomic Repository & Directory User Deletion (`src/worker/routes/systemAdmin.ts`, `adminDirectory.ts`):** Site Admins can delete repositories and directory users across all namespaces with full `repository-delete` queue cleanup (`D1` + `ROUTES` KV + `R2` packs + `DO` storage + `repository_meta`/`namespace_profile_meta`), returning `503` cleanly before mutating D1 if enqueueing fails.
- **Cross-Namespace Admin Parity (`src/worker/routes/authRepositories.ts`, `authTokens.ts`, `RepositoriesSection.tsx`):** Active Site Admins can create repositories (returning `defaultBranch: "main"`) and issue scoped PATs under any active `@namespace` shown in System Admin selectors, while non-admin users stay strictly restricted (`403`).
- **Single-Source D1 Drizzle Schema (`src/worker/db/d1/schema/*`, `drizzle/d1/0001_outgoing_vin_gonzales.sql`, `bootstrap.ts`):** All 11 D1 tables live under formal Drizzle schema + SQL migrations + `bootstrap.ts` with zero per-request runtime DDL probes in `adminDirectory.ts`, `tokens.ts`, or `workspaceMeta.ts`.

### 5. Phase 03 Completed Git Engine, Cache & DO Atomicity (`BUG-07`, `BUG-08`, `BUG-13`, `BUG-14`, `BUG-15` — ACTUAL WORKING)

- **Versioned Edge Cache & Push/Commit Purge (`src/worker/routes/git.ts`, `ui/*`, `commitFile.ts`):** `/_cache/refs`, `/_cache/tree`, `/_cache/readme`, `/_cache/owner-profile-readme`, and non-OID `/_cache/commits` keys include `v = repoRow.updatedAt`, and both CLI pushes and web commits bump `updatedAt` monotonically and purge stale keys.
- **Safe Tag/OID Read-Only Editor Guard (`src/worker/routes/ui/blob.ts`, `commitFile.ts`, `authRepositories.ts`):** Web editing is disabled (`canEditFile = false`) on tags, commit OIDs, and non-branch refs, and backend commits reject `refs/tags/*`, short tags, and commit SHAs (`400 invalid-ref`) rather than creating orphan `refs/heads/<tag>` branches.
- **Atomic DO Storage & Warm Re-Migration (`src/worker/do/repo/repoDO.ts`, `receive.ts`, `compaction/lease.ts`, `packCatalog.ts`):** `finalizeReceiveState` and `commitCompactionState` commit KV + SQLite `pack_catalog` updates inside a single `ctx.storage.transactionSync` transaction; `clearRepositoryStorage()` and idle `deleteAll()` reset `schemaReady` so warm DO reuse re-runs SQLite migrations safely.
- **Multi-Hop Tag Peel, Deep Connectivity & Web-Commit Recovery (`read/tree.ts`, `connectivity.ts`, `commitFile.ts`):** `readPath` peels multi-hop tags cleanly to commit, tree, or blob targets; `runPackConnectivityCheck` validates nested subtrees/blobs (skipping `160000` gitlinks) and parent commit chains; failed web commits abort the DO lease and delete staged R2 pack artifacts.

### 6. Phase 04 Completed Iframe UX, Admin/Route Parity & Branding (`BUG-12`, `BUG-16` – `BUG-22` — ACTUAL WORKING)

- **Zero Native Dialogs / Iframe-Safe UX (`src/client/components/ui/confirm-modal.tsx`, `repo-admin/*`, `repositories.tsx`, `tokens.tsx`, `TokensSection.tsx`):** Replaced all 16 `window.alert`/`confirm`/`prompt` calls with accessible React `<ConfirmModal>` dialogs (with typed-phrase verification for permanent repository purge), dismissible alert banners, inline OID errors, and inline clipboard feedback.
- **Auth Rate Limiting & Strict Origin Validation (`src/worker/auth/rateLimit.ts`, `origin.ts`, `authLogin.ts`):** Added KV-backed failed-attempt throttling on `/auth/login` and `/auth/api/change-password` and enforced strict protocol + host matching across forwarded reverse-proxy headers.
- **Fixed Navigation, Multi-User PAT Audit & Full Repo Branches (`Sidebar.tsx`, `systemAdmin.ts`, `adminDirectory.ts`, `tokens.ts`, `TokensSection.tsx`):** Fixed `/user/profile`, `/admin/tokens`, `/user/settings/tokens` sidebar routes and admin subpage highlighting; replaced the 24-repo branch truncation with `ROUTES` KV cached branch resolution; added `Owner` (`@slug`) attribution and `DELETE /admin/api/tokens/:patId` across all users.
- **Externalized Site Branding & Clean Settings (`src/shared/branding.ts`, `src/worker/branding.ts`, `AdminSettingsPage.tsx`, `admin-settings.tsx`, `HomePage.tsx`, `footer.tsx`):** Added live KV-backed branding editor (`PUT /admin/api/settings`), dynamic request-origin clone snippets, cleaned static telemetry dot, replaced dead `"Status"` footer link with `"Explore"`, and updated `"AES-256-GCM encrypted"` security copy (`AdminSecurityPage.tsx`).
- **JSON Route Parity & Blob Tree Handling (`tree.ts`, `commits.ts`, `admin.ts`, `git.ts`):** `/tree` delegates blobs directly to `renderBlobDocumentResponse` without corrupting bytes in JSON cache; commit fragments/diff endpoints return JSON errors on failure; DO RPCs and `tessera_sub` conflicts log structured diagnostics cleanly.

### 7. Phase 05 Completed Build, TypeScript, Unit/Worker Tests & CI Hygiene (`BUG-10`, `BUG-23` — ACTUAL WORKING)

- **Zero TypeScript & Prettier Errors (`tsconfig.json`, `.prettierignore`, deleted `src/worker/registry/index.ts`):** Root `npx tsc --noEmit`, `npm run typecheck`, and `npm run format:check` all exit `0`.
- **Node Unit & Worker Test Suites Green (`src/worker/git/pack/indexer/resolve/index.ts`, `test/github-feel.worker.test.ts`, `vitest*.config.ts`):** Decoupled `cloudflare:workers` top-level import from `resolve/index.ts` so all `14 / 14` Node unit suites (`74` tests) pass under `npm run test`; aligned `test/github-feel.worker.test.ts` with canonical homepage branding; eliminated Vite native configLoader deprecation warnings.

---

## Part 2 — Baseline Broken / Non-Functional / Mismatched Features (0 Remaining / 23 Fixed)

| Capability                                            | Current Status (`2026-11-26`)                                                                                                                                                                                                     | Root Bugs                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Viewer Role Read-Only Enforcement**                 | **FIXED (Phase 01):** `viewer` blocked (`403`) from admin UI/APIs; D1 failures fail closed; PATs honor disable/viewer demotion.                                                                                                   | ~~`BUG-01`, `BUG-02`, `BUG-03`~~           |
| **Untrusted SVG / File Serving Security**             | **FIXED (Phase 01):** SVG XSS blocked (`text/plain` + `attachment` + `CSP: sandbox` + `nosniff`), filenames sanitized.                                                                                                            | ~~`BUG-04`~~                               |
| **Iframe Read-After-Write Consistency**               | **FIXED (Phase 01):** `__Host-goc-d1-bm` carries `Secure; SameSite=None; Partitioned`.                                                                                                                                            | ~~`BUG-11`~~                               |
| **System Admin Repo/User Deletion**                   | **FIXED (Phase 02):** Cross-namespace admin repo delete & user delete enqueue `repository-delete` (`202`/`503`) wiping D1, `ROUTES`, R2 packs, DO storage, and auxiliary meta cleanly.                                            | ~~`BUG-05`~~                               |
| **System Admin Cross-Namespace Create / PAT**         | **FIXED (Phase 02):** Active Site Admins can create repos (`defaultBranch` returned) and mint scoped PATs in any active `@namespace`; non-admins stay `403`.                                                                      | ~~`BUG-06`~~                               |
| **D1 Schema Migrations Single Source**                | **FIXED (Phase 02):** All 11 tables formally defined in `src/worker/db/d1/schema/*` + `drizzle/d1/0001_outgoing_vin_gonzales.sql` + `bootstrap.ts`; runtime DDL probes removed.                                                   | ~~`BUG-09`~~                               |
| **Public Cache Freshness After Push/Commit**          | **FIXED (Phase 03):** Versioned `/_cache/*` (`v=updatedAt`) + purge on CLI `git push` and web commits ensures immediate anonymous/public freshness.                                                                               | ~~`BUG-07`~~                               |
| **Tag View Web Edit Safety**                          | **FIXED (Phase 03):** Tag refs, short tag names, and commit OIDs are read-only in web UI and rejected (`400 invalid-ref`); multi-hop tag chains peel cleanly to commit/tree/blob targets.                                         | ~~`BUG-08`, `BUG-14`~~                     |
| **DO Storage & Web-Commit Failure Recovery**          | **FIXED (Phase 03):** `finalizeReceiveState` & `commitCompactionState` run inside atomic `transactionSync`; warm DO resets re-run SQLite migrations; failed web commits abort lease & clean R2 staged objects.                    | ~~`BUG-13`, `BUG-15`~~                     |
| **Iframe Action Dialogs (Repo Admin / Account)**      | **FIXED (Phase 04):** Zero native `window.alert`/`confirm`/`prompt` calls remain; all destructive confirms and errors render inline React modals/alerts cleanly inside iframes.                                                   | ~~`BUG-12`~~                               |
| **System Admin Navigation, Branch List & Settings**   | **FIXED (Phase 04):** Fixed broken sidebar links & highlights; removed 24-repo branch truncation via KV cache; workspace-wide PAT audit & revoke live; externalized KV site branding + `"Explore"` footer link + dynamic origins. | ~~`BUG-17`, `BUG-18`, `BUG-19`, `BUG-21`~~ |
| **Auth Rate Limit, Origin Check, Diff JSON Errors**   | **FIXED (Phase 04):** KV login/password-change throttling active; strict origin protocol check enforced; `/tree` renders blobs accurately; commit diff/fragments return structured JSON errors; deterministic DB updates.         | ~~`BUG-16`, `BUG-20`, `BUG-22`~~           |
| **Typecheck, Unit Tests, Worker UI Test & Formatter** | **FIXED (Phase 05):** `npx tsc --noEmit`, `npm run typecheck`, `npm run test` (`14/14`), `npm run test:auth` (`3/3`), all `57/57` worker suites (`349/349` tests), `npm run format:check`, and `npm run build` pass cleanly.      | ~~`BUG-10`, `BUG-23`~~                     |

---

## Part 3 — Feature Delivery Progression Across Remediation Phases (`5 / 5` Completed)

- **[DONE] Phase 01 Completed (`5` bugs fixed -> Security Ready):**
  - `viewer` role genuinely blocked from repo admin UI & APIs (`403`).
  - Disabling/demoting a user immediately revokes browser sessions AND all scoped/global Git PAT write/access rights.
  - `rawpath` SVG XSS closed + D1 session bookmark works inside cross-site iframes.
- **[DONE] Phase 02 Completed (`8` bugs fixed -> Multi-Tenant Admin & D1 Integrity Ready):**
  - System Admin can create, manage, mint PATs for, and atomically delete repositories & directory users across all namespaces with zero R2/DO/`ROUTES`/meta orphans.
  - All 11 D1 tables live under canonical Drizzle migrations (`0000` + `0001`) and `bootstrap.ts` with zero runtime DDL probes.
- **[DONE] Phase 03 Completed (`13` bugs fixed -> Git Engine & Cache Production Solid):**
  - CLI `git push` and web commits immediately reflect fresh refs, trees, READMEs, and commits for anonymous/public viewers (`v=updatedAt`).
  - Tag refs are safely read-only in the web editor; nested/tree/blob tags unwrap reliably; pack connectivity checks full tree/blob reachability; failed web commits and DO operations clean up atomically.
- **[DONE] Phase 04 Completed (`21` bugs fixed -> Full UI/UX, Iframe & Branding Parity):**
  - Zero `window.alert`/`confirm`/`prompt` calls anywhere—100% iframe-safe React `<ConfirmModal>` dialogs & inline notices verified in headless Chromium.
  - Fixed sidebar routing/highlights, accurate `>=25` repo branches, workspace-wide admin PAT audit & revoke, dynamic request-origin clone URLs, white-labeled configurable settings, auth rate limiting, strict origin checks, `/tree` blob fidelity, and JSON commit API errors.
- **[DONE] Phase 05 Completed (`23/23` bugs fixed -> Release Gate Green):**
  - `npx tsc --noEmit`, `npm run typecheck`, `npm run test` (all 14 unit suites, 74 tests), `npm run test:auth` (3 tests), all 57 Cloudflare Worker integration suites (349 tests), `npm run format:check`, and `npm run build` ALL exit `0`.
