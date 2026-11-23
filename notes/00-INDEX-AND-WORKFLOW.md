# Development Notes Index & Workflow (`notes/`)

> **Status:** Active Engineering Workspace Documentation (Wave 2 — Public Homepage Company Open-Source & Team Portal Upgrade)
> **Project:** `git-on-cloudflare` (`v0.2.0` — Vib Tools Edition)
> **Baseline Freeze Date:** `2026-11-23`
> **Rule:** **ZERO application code edits happen outside a Scope-Locked Phase.** Always consult `02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md` and `04-PHASE-COMPLETION-LOG.md` before starting or finishing any phase.

---

## 1. Document Directory

| File                                                                             | Purpose                                                                                        | Code / Req ID         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| [`00-INDEX-AND-WORKFLOW.md`](./00-INDEX-AND-WORKFLOW.md)                         | Master index, architectural invariants, and phase execution loop                               | Process Guide         |
| [`01-BASELINE-FREEZE.md`](./01-BASELINE-FREEZE.md)                               | Frozen post-Wave-1 / pre-Wave-2 snapshot (`v0.2.0` Vib Tools baseline)                         | Baseline Freeze       |
| [`02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md`](./02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md) | Exact Public Homepage forensic audit with file:line citations, code patch proofs & Scope Locks | `001`                 |
| [`03-UPDATE-ROADMAP.md`](./03-UPDATE-ROADMAP.md)                                 | A–Z step-by-step phased implementation roadmap (`Phase-01` → `Phase-04`)                       | `002`                 |
| [`04-PHASE-COMPLETION-LOG.md`](./04-PHASE-COMPLETION-LOG.md)                     | Live log of completed phases, remaining phases & Scope Lock audits                             | `003`                 |
| [`05-ERROR-HANDLING.md`](./05-ERROR-HANDLING.md)                                 | Existing error handlers inventory + Public Homepage error handling & fallback guarantees       | `004`                 |
| [`06-ACTUAL-IMPLEMENTATION-STATUS.md`](./06-ACTUAL-IMPLEMENTATION-STATUS.md)     | Ground-truth ledger of working vs upcoming Public Homepage features                            | Actual Implementation |

---

## 2. Non-Negotiable Architecture & Code Invariants (From `AGENTS.md`)

Every phase update MUST preserve these core repository invariants:

1. **Single-Hop Boundaries:** `Workers -> DO`, `Workers -> R2`, or `DO -> R2` are valid; never chain `Workers -> DO -> R2` transitively or invent distributed transactions across DO and D1.
2. **Typed RPC & DO Error Discipline:** `RepoDurableObject` uses typed RPC methods and returns tagged unions; reserve `throw` inside DO for unrecoverable FUBAR states.
3. **Zero Ad-Hoc `any` / Casting & No Duplicated Helpers:** Reuse existing canonical helpers (`buildGitCloneUrl`, `buildNamespaceProfileHref`, `canAccessAdminPanel`, `canWriteRepositories`, `PROFILE_REPO_SLUG`, `PROFILE_README_PATH`, `formatRelativeTime`, `sanitizeDisplayName`). Never introduce `any` casts in new or modified code.
4. **Limiter on Platform Calls:** Every R2 and outbound DO call in request-scoped code must pass through `Limiter` (`limiter.run(label, fn)`).
5. **Route Registration Order (`src/worker/index.ts:31-173`):**
   - `registerGitRoutes(app)`, `registerAdminRoutes(app)`, `registerAuthRoutes(app)`, `registerSystemAdminRoutes(app)`, and `app.get("/")` / `app.get("/explore")` MUST stay before `registerUiRoutes(app)` so `/`, `/explore`, `/auth/*`, `/user/*`, `/admin/*`, and `/:owner/:repo/info/refs` are never shadowed by `/:owner` or `/:owner/:repo`.
6. **Raw SQL Prohibited Outside DAL:** All D1 / DO SQLite queries and mutations must live in `src/worker/db/d1/dal/` or `src/worker/do/repo/db/dal.ts`.
7. **SSR + Islands Architecture:** HTML pages render via `renderUiDocumentResponse` -> `renderUiView` (`src/client/server/registry.tsx`); interactive pieces stay focused in `src/client/islands/` with `IslandHost`.
8. **Sync Comments & Formatting:** Keep comments accurate when changing logic; leave no `"Phase 1/2/3"` or `"TODO: next phase"` milestone markers inside `src/` source files (phase tracking belongs in `notes/`, never in code comments).

---

## 3. Standard Execution Loop Per Phase

When executing **Phase-N**:

1. **Check Scope Lock:** Read Phase-N's Allowed Files and Locked/Untouched boundaries in `02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md`.
2. **Implement Strictly Within Scope:** Apply only the exact code patch authorized for Phase-N. Do not touch any file outside the Phase-N allowlist.
3. **Post-Patch Scope-Locked Audit:**
   - Re-read the modified lines and verify that every detail of the Phase-N target works cleanly with zero regressions or missing edge cases.
4. **Static, Unit & Worker Test Gates (Mandatory after edits):**
   - `npm run typecheck`
   - `npm run format:check` (or `npm run format`)
   - `npm run test` (`53/53` Node unit tests)
   - Targeted Vitest worker suites (`npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts`)
   - `compile_applet` + `lint_applet`
5. **Update Tracking Logs Before Finishing Phase:**
   - Record exact summary, verification results, and Scope Lock sign-off in `04-PHASE-COMPLETION-LOG.md`.
   - Update feature statuses in `06-ACTUAL-IMPLEMENTATION-STATUS.md` (and `05-ERROR-HANDLING.md` if error handling changed).
6. **Report to User & Provide Next-Phase Approval Command Prompt:**
   - Explain clearly what was updated, what problem was solved, what benefits were gained, whether anything outside scope changed (must be `None`), preview the next phase plan, and provide the short approval prompt for the next phase.
