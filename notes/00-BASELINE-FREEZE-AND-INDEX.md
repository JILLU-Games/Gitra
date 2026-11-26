# 00 · Baseline Freeze & Forensic Documentation Index

**Project:** `git-on-cloudflare` (Gitra) — v`0.1.0` (`package.json`)  
**Freeze Timestamp:** 2026-11-26  
**Freeze Method:** Direct inspection of live source code, configs, schemas, and executed verification commands (`.git` metadata is absent in this workspace; freeze is anchored by exact file state and test/build outputs).

---

## 1. Frozen Stack & Runtime Configuration

| Layer | Frozen Specification (Verified from Source) | Source Reference |
| :--- | :--- | :--- |
| **Runtime** | Cloudflare Workers (`compatibility_date: 2026-05-13`, `compatibility_flags: ["nodejs_als"]`) | `wrangler.jsonc:10-13`, `wrangler.paid.jsonc:9-12` |
| **Build & Bundling** | Vite `^8.0.12`, `@cloudflare/vite-plugin ^1.36.4`, `@tailwindcss/vite ^4.3.0`, React `19.2.6` SSR + Client Islands | `package.json:33-62`, `vite.config.ts:1-34` |
| **Web Router** | Hono `^4.12.18` (`new Hono<AppBindings>({ strict: false })`) | `src/worker/index.ts:43` |
| **Stateful Repo Authority** | `RepoDurableObject` (SQLite DO via `drizzle-orm/durable-sqlite`, `migrations/drizzle/repo-do/`) | `wrangler.jsonc:22-48`, `src/worker/do/repo/repoDO.ts:40-101` |
| **Control-Plane DB** | Cloudflare D1 (`DB`, `migrations_dir: drizzle/d1`, Drizzle ORM `^0.45.1`) | `wrangler.jsonc:59-65`, `package.json:26-30` |
| **Object & Pack Storage** | Cloudflare R2 (`REPO_BUCKET`) | `wrangler.jsonc:67-72` |
| **Route & Branch Cache / RL** | Cloudflare KV (`ROUTES`) + Cache API (`/_cache/refs`, `/_cache/tree`, etc.) | `wrangler.jsonc:53-58`, `src/worker/routes/git.ts:131-140`, `src/worker/auth/rateLimit.ts:124` |
| **Background Queue** | Cloudflare Queues (`REPO_TASKS_QUEUE` producer + `local-repo-maint` consumer, `max_batch_size: 1`) | `wrangler.jsonc:76-90`, `src/worker/index.ts:363-365` |
| **Tiers** | Free (`wrangler.jsonc`, `CLOUDFLARE_TIER="free"`) & Paid (`wrangler.paid.jsonc`, `limits.cpu_ms: 300000`, `CLOUDFLARE_TIER="paid"`) | `wrangler.jsonc:100-107`, `wrangler.paid.jsonc:21-23,98-105`, `src/worker/common/tier.ts:13-46` |
| **Static Assets** | Workers Assets (`binding: "ASSETS"`, `directory: "dist/client"`, `html_handling: "none"`) | `wrangler.jsonc:94-98` |

---

## 2. Frozen Verification Baseline (Live Command Snapshot)

| Command | Baseline Status | Exact Verified Output |
| :--- | :--- | :--- |
| `npm run typecheck` | **PASS** | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` exited `0` |
| `npm run build` | **PASS** | `vite build` exited `0` |
| `npm run test` | **PASS** | `14` test files passed, `75` tests passed (`vitest.unit.config.ts`) |
| `node --test test/cf-auto-deploy.node-test.ts` | **PASS** | `8` subtests passed, `0` failed |
| `npm run format:check` | **FAIL** | Exited `1` — unformatted: `public/assets/aistudio/VIB_TOOLS_COMPANY_AUTHOR_MASTER_CONTEXT_528b6a24.md`, `wrangler.paid.jsonc` |
| `npm run test:workers` | **FAIL** | `57 passed \| 1 failed (58)` files, `349 passed \| 1 failed (350)` tests — `test/demo-user-mock-repo.worker.test.ts:155:31` |

---

## 3. Baseline Freeze Alignment With Forensic Audit Report

All **21 findings (`F-01` through `F-21`)** recorded in `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md` are verified against this exact frozen baseline:
- **Critical (`2`):** `F-01` (footer `Profile` link `/admin` collision & failing worker test), `F-02` (`/auth/setup` handle vs `ADMIN_USERNAME` primary-admin subject mismatch).
- **High (`7`):** `F-03` (D1 primary admin blocked from changing/resetting password in UI), `F-04` (non-transactional `/auth/setup` lockout), `F-05` (sessions survive password change/reset), `F-09` (incremental `git fetch` `503` without `REPO_TASKS_QUEUE`), `F-10` (compaction stuck `"queued"` without queue & Free-tier alarm stall / `1102` risk), `F-17` (Git v0/v1 rejected with `400`), `F-20` (`cf-auto-deploy` unused secrets + `SESSION_SECRET` synced after `wrangler deploy`).
- **Medium (`11`):** `F-06` (misleading `ADMIN_PASSWORD set` / `(env)` labels), `F-07` (non-atomic/fail-open KV auth rate limiting), `F-08` (`__Host-` + `Secure` breaks plain HTTP non-localhost), `F-11` (fake client regex languages, hardcoded dropdown, `"Vib Tools"` fallbacks), `F-12` (missing web upload/rename/delete/folder/branch/tag UI & `@local.dev` email), `F-13` (no global Toast system & silent clipboard catches), `F-14` (no PWA manifest / SW / icons), `F-15` (design-system `--radius: 0rem`, font fallback, shadow & bypassed `ui/*` rules), `F-18` (60-repo cold-branch cap & standalone `getLimiter()`), `F-19` (`waitUntil` stale `updatedAt`/KV sync), `F-21` (clean `format:check` fail & 22 unused files in `public/assets/aistudio/`).
- **Low (`1`):** `F-16` (`rawpath` exact `referer` host guard blocks direct opens & proxies).

---

## 4. `notes/` Master Index

| Document | Purpose |
| :--- | :--- |
| `notes/PRODUCTION-FORENSIC-AUDIT-REPORT.md` | **001 Source Forensic Report** — complete root causes, line-level code evidence, Demo vs. Production parity matrix, live test/build baseline |
| `notes/00-BASELINE-FREEZE-AND-INDEX.md` | **Baseline Freeze & Index** — frozen runtime bindings, verification metrics, alignment with `F-01`–`F-21` |
| `notes/01-PRODUCTION-FIX-PATCH-SPEC.md` | **Exact Patch Spec & Scope Locks** — exact target file paths, verbatim failing code proofs, exact fix design & strict Scope Lock per phase |
| `notes/02-PHASED-UPDATE-ROADMAP.md` | **A–Z Phased Update Roadmap** — `Phase 01` to `Phase 05` execution sequence, forbidden touches, and verification gates |
| `notes/03-PHASE-EXECUTION-LOG.md` | **Phase Execution Log** — live completion ledger tracking finished phases, changed files, added features, and remaining phases |
| `notes/04-ERROR-HANDLING-INVENTORY.md` | **Error Handling Inventory** — all current error boundaries/codes + exact error handling additions required across Worker/DO/UI/Deploy |
| `notes/05-ACTUAL-IMPLEMENTATION-STATUS.md` | **Actual Implementation Tracker** — feature-by-feature truth table (Working Now vs. Demo-Only vs. Broken/Pending + post-phase status) |
