# 03 · Phase Execution & Scope-Lock Log

**Current Progress:** `0 / 5` update phases implemented (`Baseline Frozen` on **2026-11-26**)  
**Next Active Phase:** **Phase 01 — Regression Fix, Production Auth & Session Security** (`F-01`–`F-08`)  
**Total Remaining Phases:** **5** (`Phase 01`, `Phase 02`, `Phase 03`, `Phase 04`, `Phase 05`)

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
- **Status:** `PENDING (NEXT)`
- **Target Findings:** `F-01`, `F-02`, `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08`
- **Features/Fixes To Implement:**
  - Fix `footer.tsx` Profile route (`/profile/:owner`) and restore `100%` pass on `npm run test:workers`.
  - Unify canonical D1 primary-admin resolution when `/auth/setup` uses a custom handle.
  - Unlock primary-admin self-password change & admin reset UI when `ADMIN_PASSWORD` is unset.
  - Wrap `/auth/setup` mutations atomically in D1 batch/transaction.
  - Add session epoch / token-version revocation on password changes & admin resets.
  - Fix `(env)` / `ADMIN_PASSWORD set` false status labels across `/admin/settings`, `/admin/security`, `/account`.
  - Add isolate defense-in-depth fallback on KV auth rate limiting and HTTPS/HTTP adaptive cookies.
- **Scope-Locked Touch Surface:** `footer.tsx`, `src/worker/auth/*`, `src/worker/routes/{authLogin,systemAdmin,authTokens,ui/overview}.ts`, `src/worker/index.ts` (primary admin lookup), `src/worker/db/d1/*`, `src/client/pages/{AccountPage,AdminSettingsPage,AdminSecurityPage}.tsx`, `src/client/islands/{change-password,admin-users/*}`, auth/worker tests.
- **Completed Log (fill on completion):** _Pending._

---

### Phase 02 — Git Protocol, Ref Backfill, Compaction & Tier Reliability
- **Status:** `PENDING` (`4` phases after Phase 01)
- **Target Findings:** `F-09`, `F-10`, `F-17`, `F-18`, `F-19`
- **Features/Fixes To Implement:**
  - Inline `.refs` backfill recovery when `REPO_TASKS_QUEUE` is unbound (eliminates permanent `503` on incremental fetch).
  - Clean queue-missing compaction handling + Free-tier alarm re-arm & CPU budget protection.
  - Resolve Git v0/v1 vs v2 protocol mismatch on `handleUploadPackPOST`.
  - Use request-scoped `c.var.limiter` and lift silent `60`-repo `"main"` cap in `systemAdmin.ts`.
  - Harden post-push D1 `updatedAt` and KV/Cache invalidation reliability.
- **Completed Log (fill on completion):** _Pending._

---

### Phase 03 — Real Repo Metadata, Branding Defaults & Web Git Editing
- **Status:** `PENDING`
- **Target Findings:** `F-11`, `F-12`, `F-16`
- **Features/Fixes To Implement:**
  - Remove client regex language guesses, hardcoded dropdown options, and `"Vib Tools"` empty fallbacks; serve real repo metadata + neutral branding defaults.
  - Add web file upload (binary), delete, rename/move, branch/tag UI management, and configurable author commit emails.
  - Fix `rawpath` hotlink guard for direct opens & forwarded proxy hosts.
- **Completed Log (fill on completion):** _Pending._

---

### Phase 04 — Component-Only UI System (`--radius: 0rem`), Global Toast & PWA
- **Status:** `PENDING`
- **Target Findings:** `F-13`, `F-14`, `F-15`
- **Features/Fixes To Implement:**
  - Add global `<ToastProvider />` with exact API success/error notifications and clipboard failure toasts.
  - Unify global design tokens (`--radius: 0rem`, exact Segoe/Helvetica font stack, flat borders, no shadows) and enforce single-source `@/client/components/ui` usage across islands.
  - Add PWA `manifest.webmanifest`, service worker (`sw.js`), and installable app icons.
- **Completed Log (fill on completion):** _Pending._

---

### Phase 05 — Auto-Deploy Secret Hygiene, Bundle Cleanup & Formatting
- **Status:** `PENDING`
- **Target Findings:** `F-20`, `F-21`
- **Features/Fixes To Implement:**
  - Sync `SESSION_SECRET` before initial `wrangler deploy` and remove unused `CREDENTIAL_SECRET` / `ADMIN_BOOTSTRAP_SECRET` secret generation.
  - Remove 22 unreferenced `/public/assets/aistudio/` artifacts and bring `npm run format:check` (`prettier --check .`) to `0` errors.
- **Completed Log (fill on completion):** _Pending._
