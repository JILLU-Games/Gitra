# 00 · Baseline Freeze & Forensic Documentation Index

**Project:** `git-on-cloudflare` (Gitra) — v`0.1.0` (`package.json`)  
**Freeze Timestamp:** 2026-11-26  
**Freeze Method:** Direct inspection of live source code, configs, schemas, and executed verification commands (`.git` metadata is absent in this workspace; freeze is anchored by exact file state and test/build outputs).

---

## 1. Frozen Stack & Runtime Configuration

| Layer                         | Frozen Specification (Verified from Source)                                                                                         | Source Reference                                                                                |
| :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **Runtime**                   | Cloudflare Workers (`compatibility_date: 2026-05-13`, `compatibility_flags: ["nodejs_als"]`)                                        | `wrangler.jsonc:10-13`, `wrangler.paid.jsonc:9-12`                                              |
| **Build & Bundling**          | Vite `^8.0.12`, `@cloudflare/vite-plugin ^1.36.4`, `@tailwindcss/vite ^4.3.0`, React `19.2.6` SSR + Client Islands                  | `package.json:33-62`, `vite.config.ts:1-34`                                                     |
| **Web Router**                | Hono `^4.12.18` (`new Hono<AppBindings>({ strict: false })`)                                                                        | `src/worker/index.ts:43`                                                                        |
| **Stateful Repo Authority**   | `RepoDurableObject` (SQLite DO via `drizzle-orm/durable-sqlite`, `migrations/drizzle/repo-do/`)                                     | `wrangler.jsonc:22-48`, `src/worker/do/repo/repoDO.ts:40-101`                                   |
| **Control-Plane DB**          | Cloudflare D1 (`DB`, `migrations_dir: drizzle/d1`, Drizzle ORM `^0.45.1`)                                                           | `wrangler.jsonc:59-65`, `package.json:26-30`                                                    |
| **Object & Pack Storage**     | Cloudflare R2 (`REPO_BUCKET`)                                                                                                       | `wrangler.jsonc:67-72`                                                                          |
| **Route & Branch Cache / RL** | Cloudflare KV (`ROUTES`) + Cache API (`/_cache/refs`, `/_cache/tree`, etc.)                                                         | `wrangler.jsonc:53-58`, `src/worker/routes/git.ts:131-140`, `src/worker/auth/rateLimit.ts:124`  |
| **Background Queue**          | Cloudflare Queues (`REPO_TASKS_QUEUE` producer + `local-repo-maint` consumer, `max_batch_size: 1`)                                  | `wrangler.jsonc:76-90`, `src/worker/index.ts:363-365`                                           |
| **Tiers**                     | Free (`wrangler.jsonc`, `CLOUDFLARE_TIER="free"`) & Paid (`wrangler.paid.jsonc`, `limits.cpu_ms: 300000`, `CLOUDFLARE_TIER="paid"`) | `wrangler.jsonc:100-107`, `wrangler.paid.jsonc:21-23,98-105`, `src/worker/common/tier.ts:13-46` |
| **Static Assets**             | Workers Assets (`binding: "ASSETS"`, `directory: "dist/client"`, `html_handling: "none"`)                                           | `wrangler.jsonc:94-98`                                                                          |

---

## 2. Frozen Verification Baseline (Live Command Snapshot)

| Command                                        | Baseline Status | Exact Verified Output                                                                                                         |
| :--------------------------------------------- | :-------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                            | **PASS**        | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`                                |
| `npm run build`                                | **PASS**        | `vite build` exited `0`                                                                                                       |
| `npm run test`                                 | **PASS**        | `14` test files passed, `75` tests passed (`vitest.unit.config.ts`)                                                           |
| `node --test test/cf-auto-deploy.node-test.ts` | **PASS**        | `8` subtests passed, `0` failed                                                                                               |
| `npm run format:check`                         | **FAIL**        | Exited `1` — unformatted: `public/assets/aistudio/VIB_TOOLS_COMPANY_AUTHOR_MASTER_CONTEXT_528b6a24.md`, `wrangler.paid.jsonc` |
| `npm run test:workers`                         | **FAIL**        | `57 passed \| 1 failed (58)` files, `349 passed \| 1 failed (350)` tests — `test/demo-user-mock-repo.worker.test.ts:155:31`   |

### 2.1 Post-Phase 01 Verification Snapshot (`2026-11-26`)

| Command                | Post-Phase 01 Status | Exact Verified Output                                                                                                                                                                   |
| :--------------------- | :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | **PASS**             | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`                                                                                          |
| `npm run test`         | **PASS**             | `14` test files passed, `82` tests passed (`vitest.unit.config.ts`)                                                                                                                     |
| `npm run test:auth`    | **PASS**             | `1` test file passed, `3` tests passed (`test/auth.worker.test.ts`)                                                                                                                     |
| `npm run test:workers` | **PASS**             | `58 passed (58)` files, `350 passed (350)` tests (`test/demo-user-mock-repo.worker.test.ts`, `test/auth-production-setup.worker.test.ts`, `test/auth-session.worker.test.ts` all green) |

### 2.2 Post-Phase 02 Verification Snapshot (`2026-11-26`)

| Command                                                                                                                                                                                                                       | Post-Phase 02 Status | Exact Verified Output                                                                           |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------- | :---------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                                                                                                                           | **PASS**             | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`  |
| `npm run test`                                                                                                                                                                                                                | **PASS**             | `14` test files passed, `82` tests passed (`vitest.unit.config.ts`)                             |
| `npx tsx --test test/cloudflare-tier.node-test.ts`                                                                                                                                                                            | **PASS**             | `5` subtests passed, `0` failed (including `exceedsFreeTierCompactionBudget`)                   |
| `npx vitest run --config vitest.config.ts test/fetch-streaming.worker.test.ts test/streaming-compaction.worker.test.ts test/alarm-cleanup.worker.test.ts test/streaming-receive.worker.test.ts test/info-refs.worker.test.ts` | **PASS**             | `5 passed (5)` files, `51 passed (51)` tests (`F-09`, `F-10`, `F-17`, `F-18`, `F-19` all green) |

### 2.3 Post-Phase 03 Verification Snapshot (`2026-11-26`)

| Command                                                                                                                   | Post-Phase 03 Status | Exact Verified Output                                                                                       |
| :------------------------------------------------------------------------------------------------------------------------ | :------------------- | :---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                       | **PASS**             | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`              |
| `npm run build`                                                                                                           | **PASS**             | `vite build` exited `0` (`compile_applet`)                                                                  |
| `npm run test`                                                                                                            | **PASS**             | `15` test files passed, `86` tests passed (`vitest.unit.config.ts`, including `test/phase03-logic.test.ts`) |
| `npx --yes tsx --test test/phase04-logic.node-test.ts test/cf-auto-deploy.node-test.ts test/cloudflare-tier.node-test.ts` | **PASS**             | `24` tests passed (`0` failed)                                                                              |
| `npm run test:workers`                                                                                                    | **PASS**             | `59 passed (59)` files, `356 passed (356)` tests (including `test/phase03-web-git.worker.test.ts`)          |

### 2.4 Post-Phase 04 Verification Snapshot (`2026-11-26`)

| Command                                                    | Post-Phase 04 Status | Exact Verified Output                                                                                                                                                                                                                                                         |
| :--------------------------------------------------------- | :------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                        | **PASS**             | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`                                                                                                                                                                                |
| `npm run build`                                            | **PASS**             | `vite build` (`compile_applet`) exited `0`                                                                                                                                                                                                                                    |
| `npm run test`                                             | **PASS**             | `15` test files passed, `86` tests passed (`vitest.unit.config.ts`)                                                                                                                                                                                                           |
| `npx --yes tsx --test test/phase04-ui-pwa.node-test.ts`    | **PASS**             | `4` subtests passed (`0` failed) — Toast queue, SW bypass, manifest/PNG icons, `--radius: 0rem` CSS tokens                                                                                                                                                                    |
| `npm run test:workers`                                     | **PASS**             | `60 passed (60)` files, `357` tests passed (`test/phase04-pwa-ui.worker.test.ts` + all 59 prior suites green)                                                                                                                                                                 |
| Live Chromium (`playwright-cli` @ `http://localhost:3000`) | **PASS**             | `/manifest.webmanifest`, `/sw.js`, `/icons/icon-{192,512}.png`, `/apple-touch-icon.png` HTTP `200`; `borderRadius: 0px`; `boxShadow: none`; Segoe/Helvetica stack verified; Clone clipboard error toast rendered at `1440x900` & `390x844` (`0` overflow, `0` console errors) |

### 2.5 Post-Phase 05 Final Verification Snapshot (`2026-11-26`)

| Command                                                                                                                                                  | Post-Phase 05 Status | Exact Verified Output                                                                                             |
| :------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                                                                      | **PASS**             | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0`                    |
| `npm run format:check`                                                                                                                                   | **PASS**             | `prettier --check .` — `All matched files use Prettier code style!` (exit `0`)                                    |
| `npm run test`                                                                                                                                           | **PASS**             | `15` test files passed, `86` tests passed (`vitest.unit.config.ts`)                                               |
| `node --test test/cf-auto-deploy.node-test.ts`                                                                                                           | **PASS**             | `10` tests passed (`0` failed) — `SESSION_SECRET`-only, pre-deploy `--secrets-file`, no `aistudio` assets         |
| `npx --yes tsx --test test/cloudflare-tier.node-test.ts test/phase04-ui-pwa.node-test.ts`                                                                | **PASS**             | `10` tests passed (`0` failed)                                                                                    |
| `npm run build`                                                                                                                                          | **PASS**             | `vite build` (`compile_applet`) exited `0`, zero `dist/client/assets/aistudio` bloat                              |
| `npx vitest run --config vitest.config.ts test/phase04-pwa-ui.worker.test.ts test/auth-production-setup.worker.test.ts test/system-admin.worker.test.ts` | **PASS**             | `3 passed (3)` files, `12` tests passed (runtime `src/worker/` untouched since `60/60` `357/357` full suite pass) |

---

## 3. Baseline Freeze Alignment With Forensic Audit Report

All **21 findings (`F-01` through `F-21`)** recorded in `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md` are verified **resolved across Phases `01`–`05`**:

- **Critical (`2`):** `F-01` (**FIXED Phase 01** — footer `Profile` link `/admin` collision & failing worker test), `F-02` (**FIXED Phase 01** — `/auth/setup` handle vs `ADMIN_USERNAME` primary-admin subject mismatch).
- **High (`7`):** `F-03` (**FIXED Phase 01** — D1 primary admin blocked from changing/resetting password in UI), `F-04` (**FIXED Phase 01** — non-transactional `/auth/setup` lockout), `F-05` (**FIXED Phase 01** — sessions survive password change/reset), `F-09` (**FIXED Phase 02** — incremental `git fetch` `503` without `REPO_TASKS_QUEUE`), `F-10` (**FIXED Phase 02** — compaction stuck `"queued"` without queue & Free-tier alarm stall / `1102` risk), `F-17` (**FIXED Phase 02** — Git v0/v1 rejected with `400`), `F-20` (**FIXED Phase 05** — `cf-auto-deploy` reconciles `SESSION_SECRET`-only before deploy and attaches pending secrets atomically via `--secrets-file`).
- **Medium (`11`):** `F-06` (**FIXED Phase 01** — misleading `ADMIN_PASSWORD set` / `(env)` labels), `F-07` (**FIXED Phase 01** — non-atomic/fail-open KV auth rate limiting), `F-08` (**FIXED Phase 01** — `__Host-` + `Secure` breaks plain HTTP non-localhost), `F-11` (**FIXED Phase 03** — real server/KV-derived repo language/license/version/branch, empty filter cleanup, neutral `DEFAULT_SITE_BRANDING`), `F-12` (**FIXED Phase 03** — web binary upload, file delete/rename/move, subfolder editing, branch/tag UI & configurable D1 `commit_email`), `F-13` (**FIXED Phase 04** — global `<ToastProvider />` / `showToast` / `copyToClipboard` & removal of forced `window.location.reload()` timers), `F-14` (**FIXED Phase 04** — `/manifest.webmanifest`, `/sw.js`, PNG/SVG install icons & footer PWA install/offline indicator), `F-15` (**FIXED Phase 04** — flat `--radius: 0rem` design tokens, Segoe/Helvetica font stack, shadow removal, unified `@/client/components/ui` usage), `F-18` (**FIXED Phase 02** — 60-repo cold-branch cap & standalone `getLimiter()`), `F-19` (**FIXED Phase 02** — `waitUntil` stale `updatedAt`/KV sync), `F-21` (**FIXED Phase 05** — removed 22 unreferenced `/public/assets/aistudio/` files, added `.prettierrc` `*.jsonc` override, `npm run format:check` passes `0` issues).
- **Low (`1`):** `F-16` (**FIXED Phase 03** — `rawpath` `Sec-Fetch-Site: none|same-origin` & `X-Forwarded-Host` support).

---

## 4. `notes/` Master Index

| Document                                    | Purpose                                                                                                                                      |
| :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------- |
| `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md` | **001 Source Forensic Report** — complete root causes, line-level code evidence, Demo vs. Production parity matrix, live test/build baseline |
| `notes/00-BASELINE-FREEZE-AND-INDEX.md`     | **Baseline Freeze & Index** — frozen runtime bindings, verification metrics, alignment with `F-01`–`F-21`                                    |
| `notes/01-PRODUCTION-FIX-PATCH-SPEC.md`     | **Exact Patch Spec & Scope Locks** — exact target file paths, verbatim failing code proofs, exact fix design & strict Scope Lock per phase   |
| `notes/02-PHASED-UPDATE-ROADMAP.md`         | **A–Z Phased Update Roadmap** — `Phase 01` to `Phase 05` execution sequence, forbidden touches, and verification gates                       |
| `notes/03-PHASE-EXECUTION-LOG.md`           | **Phase Execution Log** — live completion ledger tracking finished phases, changed files, added features, and remaining phases               |
| `notes/04-ERROR-HANDLING-INVENTORY.md`      | **Error Handling Inventory** — all current error boundaries/codes + exact error handling additions required across Worker/DO/UI/Deploy       |
| `notes/05-ACTUAL-IMPLEMENTATION-STATUS.md`  | **Actual Implementation Tracker** — feature-by-feature truth table (Working Now vs. Demo-Only vs. Broken/Pending + post-phase status)        |
