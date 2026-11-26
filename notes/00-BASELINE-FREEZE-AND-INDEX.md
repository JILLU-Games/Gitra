# 00 — Baseline Freeze & Documentation Index

**Freeze Timestamp:** `2026-11-26`  
**Workspace Root:** `/app/applet` (Note: `git status --short` returned `fatal: not a git repository` — no `.git` metadata exists in this workspace, so this `notes/` ledger is the canonical baseline & change-control record.)  
**Baseline Rule:** Zero source (`src/`), test (`test/`), migration (`drizzle/`), or config files were modified while generating this documentation pack. All fixes MUST execute phase-by-phase strictly against this frozen baseline.

---

## 1. Documentation Pack Index (`/notes/`)

| File                                  | Requirement           | Purpose                                                                                                                                                                 |
| ------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORENSIC-PRODUCTION-AUDIT-REPORT.md` | Baseline Audit        | Verified source-code audit report identifying all **23 bugs** (`3 Critical`, `8 High`, `9 Medium`, `3 Low`), Demo vs Production parity, and UI vs Backend truth matrix. |
| `00-BASELINE-FREEZE-AND-INDEX.md`     | Baseline Freeze       | Freezes current build/tsc/test/format outputs, workspace inventory, and global invariants that must not regress.                                                        |
| `01-PRODUCTION-FIX-PATCH-SPEC.md`     | **001**               | Exact `file:line`, verbatim baseline code block proofs, target patch designs, and explicit **Per-Phase Scope Locks** for all 23 bugs (`BUG-01`–`BUG-23`).               |
| `02-PHASED-UPDATE-ROADMAP.md`         | **002**               | A–Z **5-Phase** remediation sequence (`Phase 01`–`Phase 05`), prerequisite chain, regression guardrails, and phase exit gates.                                          |
| `03-PHASE-EXECUTION-LOG.md`           | **003**               | Live execution & completion tracker (`Completed: 0/5`, `Remaining: 5/5`) with per-phase changelogs and Scope-Lock "unrelated features/UI unchanged" signoff blocks.     |
| `04-ERROR-HANDLING-INVENTORY.md`      | **004**               | Exhaustive inventory of existing error handlers (`src/worker/`, `src/client/`, DO, Queue) + every missing/broken error handler mapped to Phases 01–05.                  |
| `05-ACTUAL-IMPLEMENTATION-STATUS.md`  | **Actual Implements** | Live capability ledger showing what actually works in Demo & Production at Baseline, what becomes functional after each Phase (`01`–`05`), and what remains broken.     |

---

## 2. Frozen Baseline Verification Snapshot (Exact Command Results)

These results were directly executed and recorded against the unmodified workspace:

| Command                                                                                               |   Exit Code    | Verified Output Summary                                                                                                                                                                         | Bug Mapping       |
| ----------------------------------------------------------------------------------------------------- | :------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `npm run build`                                                                                       | `0` (**PASS**) | Built `dist/git_on_cloudflare/index.js` (`2,013.74 kB`) and `dist/client/manifest.json`.                                                                                                        | Clean at baseline |
| `npm run typecheck`                                                                                   | `0` (**PASS**) | `wrangler types --env-file .dev.vars.example && tsc -p test/tsconfig.json --noEmit` succeeded.                                                                                                  | Clean at baseline |
| `npx tsc --noEmit` (root `tsconfig.json`)                                                             | `2` (**FAIL**) | **10 TS errors** across 6 files: `src/worker/registry/index.ts(5,15)` (`TS2307`), `src/worker/auth/adminAuth.ts(92,24)` (`TS2339`), and 4 `src/shared/**/*.test.ts` files (`TS2591`, `TS7006`). | `BUG-10`          |
| `npm run test` (`vitest.unit.config.ts`)                                                              | `1` (**FAIL**) | **9 suites (54 tests) passed**; **5 suites crashed at module import** (`Cannot find package 'cloudflare:workers'` via `src/worker/git/pack/indexer/resolve/index.ts:19:1`).                     | `BUG-10`          |
| `npm run format:check`                                                                                | `1` (**FAIL**) | **0 formatting errors in `src/` or `test/`**; 7 files under `.aistudio/artifacts/...` and `.playwright-cli/...` failed check.                                                                   | `BUG-23`          |
| `npm run test:auth` (`test/auth.worker.test.ts`)                                                      | `0` (**PASS**) | `3 passed (3)` (`vitest.config.ts:10-12` filters strictly to auth suite when `auth.worker.test.ts` is on CLI argv).                                                                             | Clean at baseline |
| `npx vitest run --config vitest.config.ts test/repository-delete.worker.test.ts`                      | `0` (**PASS**) | `3 passed (3)`.                                                                                                                                                                                 | Clean at baseline |
| Targeted ACL/Admin batch (`system-admin`, `pat-verify`, `git-acl`, `admin-disclosure`, `repo-create`) | `0` (**PASS**) | `5 test files passed, 58 tests passed` (`B3_EXIT=0`).                                                                                                                                           | Clean at baseline |
| Batch (`streaming-receive`, `streaming-compaction`, `alarm-cleanup`, `github-feel`)                   | `1` (**FAIL**) | `3 passed`, **`1 failed`**: `test/github-feel.worker.test.ts:254:28` (`GHF_EXIT=1`) (`26 passed, 1 failed`).                                                                                    | `BUG-10`          |

---

## 3. Master Bug Count & Phase Assignment Matrix

| Phase        | Title                                                        | Bug IDs Covered                                                                | Severity Breakdown                         |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------ |
| **Phase 01** | Critical Security, RBAC, XSS & Consistency Cookies           | `BUG-01`, `BUG-02`, `BUG-03`, `BUG-04`, `BUG-11`                               | `3 Critical`, `2 High`                     |
| **Phase 02** | Data Integrity, Atomic Deletions, Admin Parity & D1 Schema   | `BUG-05`, `BUG-06`, `BUG-09`                                                   | `3 High`                                   |
| **Phase 03** | Git Engine, Edge Cache Invalidation & DO Lifecycle Atomicity | `BUG-07`, `BUG-08`, `BUG-13`, `BUG-14`, `BUG-15`                               | `2 High`, `3 Medium`                       |
| **Phase 04** | Iframe UX, Admin/Route Parity, Hardening & Branding          | `BUG-12`, `BUG-16`, `BUG-17`, `BUG-18`, `BUG-19`, `BUG-20`, `BUG-21`, `BUG-22` | `6 Medium`, `2 Low`                        |
| **Phase 05** | Build, TypeScript, Unit/Worker Tests & CI Hygiene            | `BUG-10`, `BUG-23`                                                             | `1 High`, `1 Low`                          |
| **TOTAL**    | **All 5 Phases**                                             | **23 Verified Bugs (`BUG-01`–`BUG-23`)**                                       | **3 Critical · 8 High · 9 Medium · 3 Low** |

---

## 4. Non-Negotiable Core Invariants (Frozen Across All Phases)

Every phase fix MUST preserve these architectural invariants verified in `AGENTS.md` and live source code:

1. **Route Registration Order (`src/worker/index.ts:39-46,212`):** `registerGitRoutes`, `registerAdminRoutes`, `registerAuthRoutes`, and `registerSystemAdminRoutes` MUST stay registered BEFORE `registerUiRoutes` so `/:owner` never shadows `/auth`, `/user`, or `/admin`.
2. **HTML Routing Ownership (`wrangler.jsonc`):** `assets.html_handling = "none"` — Worker owns all HTML page rendering via `renderUiDocumentResponse` and `src/client/server/registry.tsx`.
3. **Auth Isolation & Non-Disclosure:**
   - Git PATs authenticate ONLY Git Smart HTTP endpoints (`/info/refs`, `/git-upload-pack`, `/git-receive-pack`)—never browser UI/admin endpoints.
   - Admin endpoints enforce browser session + `sameOriginViolation(c)` CSRF protection on mutations.
   - Private repositories return `404` identically to anonymous callers and non-members on UI/JSON endpoints.
4. **DO & D1 Separation:**
   - `RepoDurableObject` remains the authoritative store for Git refs, `HEAD`, pack catalog SQLite rows, and receive/compaction leases.
   - Cross-runtime boundary discipline: avoid transitive `Worker -> DO -> R2` chains and never introduce `throw` across DO RPCs where tagged unions are expected.
   - Atomic repo deletion MUST go through `REPO_TASKS_QUEUE` (`kind: "repository-delete"`), never partial D1 deletion leaving orphaned R2/DO state.
5. **UI & Theme Preservation:** Dark forge aesthetic, zero unnecessary layout churn outside strictly scoped bug fixes, and zero unrequested AI/chat additions.
