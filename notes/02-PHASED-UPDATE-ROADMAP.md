# 02 — Phased Production Update Roadmap (A–Z, Req 002)

**Strategy:** Execute fixes sequentially across **5 Scope-Locked Phases** ordered by security severity, data-safety dependencies, and build-verification stability. Never overlap phases or edit files outside the active Phase's Scope Lock.

---

## Roadmap Dependency Graph

```text
Frozen Baseline (2026-11-26)
   │
   ▼
[Phase 01] Critical Security, RBAC, XSS & Consistency Cookies
   │  (BUG-01, BUG-02, BUG-03, BUG-04, BUG-11)
   ▼
[Phase 02] Data Integrity, Atomic Deletions, Admin Parity & D1 Schema
   │  (BUG-05, BUG-06, BUG-09)
   ▼
[Phase 03] Git Engine, Edge Cache Invalidation & DO Lifecycle Atomicity
   │  (BUG-07, BUG-08, BUG-13, BUG-14, BUG-15)
   ▼
[Phase 04] Iframe UX, Admin/Route Parity, Hardening & Branding
   │  (BUG-12, BUG-16, BUG-17, BUG-18, BUG-19, BUG-20, BUG-21, BUG-22)
   ▼
[Phase 05] Build, TypeScript, Unit/Worker Tests & CI Hygiene
      (BUG-10, BUG-23)
   │
   ▼
Production Release Readiness Gate (All Suites Green)
```

---

## Detailed A–Z Phase Execution Plan

### Phase 01 — Critical Security, RBAC, XSS & Consistency Cookies

- **Bugs:** `BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`, `BUG-11`
- **Why First:** Closes live privilege escalation (`viewer` accessing `/admin` APIs, disabled users holding valid scoped PATs, fail-open `"member"` D1 fallback), eliminates stored SVG XSS on same-origin `rawpath`, and fixes `__Host-goc-d1-bm` iframe consistency loss before touching admin/cache flows.
- **Step-by-Step:**
  1. Lock repo admin page + API routes to `canWriteRepositories(viewer.role)` (`helpers.ts`, `adminPage.ts`).
  2. Enforce user `status !== "disabled"` and non-`viewer` write caps on ALL PAT grant branches (`pat.ts`).
  3. Fail closed on D1 metadata lookup exceptions and default missing metadata conservatively (`session.ts`).
  4. Harden `raw.ts` (`CSP: sandbox`, `nosniff`, safe `Content-Type` + escaped `Content-Disposition`) and `blob.ts` SVG handling.
  5. Upgrade `D1_BOOKMARK_COOKIE_OPTIONS` (`d1Bookmark.ts`) to `secure: true`, `sameSite: "None"`, `partitioned: true`.
- **Acceptance Verification Commands:**
  - `npm run typecheck`
  - `npm run test:auth`
  - `npx vitest run --config vitest.config.ts test/pat-verify.worker.test.ts test/git-acl.worker.test.ts test/admin-disclosure.worker.test.ts test/auth-session.worker.test.ts test/d1-session.worker.test.ts`

---

### Phase 02 — Data Integrity, Atomic Deletions, Admin Parity & D1 Schema

- **Bugs:** `BUG-05`, `BUG-06`, `BUG-09`
- **Prerequisites:** Phase 01 complete (ensuring RBAC & D1 bookmark consistency work cleanly across cross-namespace mutations).
- **Step-by-Step:**
  1. Consolidate `namespace_directory_meta`, `pat_global_grants`, `namespace_profile_meta`, and `repository_meta` into `src/worker/db/d1/schema/` -> generate Drizzle migration -> align `bootstrap.ts` -> remove runtime DDL probes (`adminDirectory.ts`, `tokens.ts`, `workspaceMeta.ts`).
  2. Fix `DELETE /admin/api/repositories/:id` & `deleteNamespaceEntry` to enqueue full `repository-delete` cleanup (D1 + `ROUTES` KV + R2 + DO) and allow System Admins to delete cross-namespace repos safely.
  3. Grant active Site Admins cross-namespace create/token parity (matching UI dropdowns in `TokensSection.tsx` & `RepositoriesSection.tsx`) and stop hardcoding `defaultBranch: "main"`.
- **Acceptance Verification Commands:**
  - `npm run db:generate:d1` & schema sync check
  - `npm run typecheck`
  - `npx vitest run --config vitest.config.ts test/system-admin.worker.test.ts test/repository-delete.worker.test.ts test/d1-schema.worker.test.ts test/repo-create.worker.test.ts test/pat-management.worker.test.ts`

---

### Phase 03 — Git Engine, Edge Cache Invalidation & DO Lifecycle Atomicity

- **Bugs:** `BUG-07`, `BUG-08`, `BUG-13`, `BUG-14`, `BUG-15`
- **Prerequisites:** Phase 02 complete (repo & D1 lifecycle stable).
- **Step-by-Step:**
  1. Thread `v: String(route.updatedAt)` into all `/_cache/refs`, `/_cache/tree`, `/_cache/readme`, `/_cache/owner-profile-readme`, and mutable `/_cache/commits` cache keys; unify invalidation after both CLI `git push` and web `commitRepositoryFile`.
  2. Block inline web commits on tags (`refs/tags/*`) and 40-hex commit SHAs (`blob.ts` + `commitFile.ts`).
  3. Ensure `commitRepositoryFile` aborts the receive lease on non-committed finalize states and cleans up staged `.pack`/`.idx`/`.refs` in R2.
  4. Wrap DO catalog/KV updates in transactions and ensure warm DO resets re-run SQLite migrations after `deleteAll()`.
  5. Fix nested/non-commit tag unwrapping in `read/tree.ts` and strengthen `runPackConnectivityCheck` tree/blob traversal.
- **Acceptance Verification Commands:**
  - `npm run typecheck`
  - `npx vitest run --config vitest.config.ts test/cache-policy.worker.test.ts test/readpath-tag-peel.worker.test.ts test/receive-connectivity.worker.test.ts test/streaming-receive.worker.test.ts test/streaming-compaction.worker.test.ts test/pack-first-fetch-and-ui.worker.test.ts`

---

### Phase 04 — Iframe UX, Admin/Route Parity, Hardening & Branding

- **Bugs:** `BUG-12`, `BUG-16`, `BUG-17`, `BUG-18`, `BUG-19`, `BUG-20`, `BUG-21`, `BUG-22`
- **Prerequisites:** Phases 01–03 complete (all backend security, deletion, and Git engine paths sound).
- **Step-by-Step:**
  1. Remove all 16 native `window.alert`/`confirm`/`prompt` calls in `src/client/islands/` (`BUG-12`), replacing with inline modals/confirmations/notices.
  2. Fix `Sidebar.tsx` links & `resolveActiveSidebarItem` (`BUG-17`) and update `"AES-256-GCM encrypted"` copy in `AdminSecurityPage.tsx` (`BUG-21`).
  3. Fix `handleTree` binary/oversized blob delegate & make `handleCommitFragments`/`handleCommitDiff` return JSON errors (`BUG-20`).
  4. Resolve >24 repo default-branch truncation + add workspace-wide PAT visibility/revoke in `/admin/tokens` (`BUG-18`).
  5. Implement auth attempt throttling & tighten `isAllowedOrigin` (`BUG-16`), plus directory query `ORDER BY` + safe SQL profile patch (`BUG-22`).
  6. Externalize configurable site branding/origin clone URLs/footer links & clarify or wire mutable `/admin/settings` controls (`BUG-19`).
- **Acceptance Verification Commands:**
  - `npm run typecheck`
  - `npm run build`
  - Real Chromium preview check (`playwright-cli`) across homepage, admin panel, repo admin modal confirmations (zero `alert/confirm/prompt` dialogs), and error/diff JSON endpoints.

---

### Phase 05 — Build, TypeScript, Unit/Worker Tests & CI Hygiene

- **Bugs:** `BUG-10`, `BUG-23`
- **Prerequisites:** Phases 01–04 complete (so final copy in `HomePage.tsx` / branding from Phase 04 is settled before locking final test assertions!).
- **Step-by-Step:**
  1. Delete dead `src/worker/registry/index.ts`, resolve `ImportMetaEnv.PROD` & `src/shared/**/*.test.ts` TS errors so `npx tsc --noEmit` exits `0`.
  2. Decouple `cloudflare:workers` top-level import from `src/worker/git/pack/indexer/resolve/index.ts` so all 14 suites under `npm run test` (`vitest.unit.config.ts`) run and pass under Node.
  3. Update `test/github-feel.worker.test.ts` assertions cleanly to match verified Production homepage output.
  4. Update `.prettierignore` (`.aistudio/`, `.playwright-cli/`) and clean `__dirname` / extensionless imports in `vitest*.config.ts`.
- **Final Release Gate Commands (All MUST exit `0`):**
  - `npx tsc --noEmit`
  - `npm run typecheck`
  - `npm run test`
  - `npm run test:auth`
  - `npm run test:workers`
  - `npm run format:check`
  - `npm run build`
