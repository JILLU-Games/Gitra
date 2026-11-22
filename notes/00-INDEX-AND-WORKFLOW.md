# Development Notes Index & Workflow (`notes/`)

> **Status:** Active Engineering Workspace Documentation
> **Project:** `git-on-cloudflare` (`v0.1.0`)
> **Baseline Date:** `2026-11-22`
> **Rule:** **ZERO application code edits happen outside a Scope-Locked Phase.** Always consult `02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md` and `04-PHASE-COMPLETION-LOG.md` before starting or finishing any phase.

---

## 1. Document Directory

| File                                                                             | Purpose                                                                            | Code / Req ID         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------- |
| [`00-INDEX-AND-WORKFLOW.md`](./00-INDEX-AND-WORKFLOW.md)                         | Master index, invariants, and phase execution loop                                 | Process Guide         |
| [`01-BASELINE-FREEZE.md`](./01-BASELINE-FREEZE.md)                               | Frozen pre-refactor snapshot of `v0.1.0` & baseline verification                   | Baseline Freeze       |
| [`02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md`](./02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md) | Exact bug/UI/RBAC audit with file:line citations, code proofs & Scope Locks        | `001`                 |
| [`03-UPDATE-ROADMAP.md`](./03-UPDATE-ROADMAP.md)                                 | A–Z step-by-step phased implementation roadmap (`Phase-01` → `Phase-06`)           | `002`                 |
| [`04-PHASE-COMPLETION-LOG.md`](./04-PHASE-COMPLETION-LOG.md)                     | Live log of completed phases, remaining phases & Scope Lock audits                 | `003`                 |
| [`05-ERROR-HANDLING.md`](./05-ERROR-HANDLING.md)                                 | Existing error handlers inventory + hardening plan for silent catches & SSR errors | `004`                 |
| [`06-ACTUAL-IMPLEMENTATION-STATUS.md`](./06-ACTUAL-IMPLEMENTATION-STATUS.md)     | Ground-truth ledger of working vs broken/flawed vs missing features                | Actual Implementation |

---

## 2. Non-Negotiable Architecture & Code Invariants (From `AGENTS.md`)

Every phase update MUST preserve these core repository invariants:

1. **Single-Hop Boundaries:** `Workers -> DO`, `Workers -> R2`, or `DO -> R2` are valid; never chain `Workers -> DO -> R2` transitively or invent distributed transactions across DO and D1.
2. **Typed RPC & DO Error Discipline:** `RepoDurableObject` uses typed RPC methods and returns tagged unions; reserve `throw` inside DO for unrecoverable FUBAR states.
3. **Zero Ad-Hoc `any` / Casting & No Duplicated Helpers:** Reuse existing canonical helpers (`isValidOwnerRepo`, `isValidRef`, `isValidPath`, `OID_RE`, `canAccessAdminPanel`, `canWriteRepositories`, `normalizeNamespaceHandle`, `Limiter`, `getLimiter`). Never introduce `any` casts in new or modified code.
4. **Limiter on Platform Calls:** Every R2 and outbound DO call in request-scoped code must pass through `Limiter` (`limiter.run(label, fn)`).
5. **Route Registration Order (`src/worker/index.ts:163-181`):**
   - `registerAuthRoutes(router)` and `registerSystemAdminRoutes(router)` and `registerGitRoutes(router)` MUST stay before `registerUiRoutes(router)` so `/auth/*`, `/user/*`, `/admin/*`, and `/:owner/:repo/info/refs` are never shadowed by `/:owner` or `/:owner/:repo`.
6. **Raw SQL Prohibited Outside DAL:** All D1 / DO SQLite mutations must live in `src/worker/db/d1/dal/` or `src/worker/do/repo/db/dal.ts`.
7. **D1 Session Primary/Replica Anchoring:** Keep bookmark cookie persistence and `read-only` / `first-primary` / `first-unconstrained` routing intact (`src/worker/routes/d1Bookmark.ts`, `src/worker/index.ts:116-143`).
8. **SSR + Islands Architecture:** HTML pages render via `renderUiDocumentResponse` -> `renderUiView` (`src/client/server/registry.tsx`); interactive pieces stay small in `src/client/islands/` with `IslandHost`.
9. **Sync Comments & Formatting:** Keep comments accurate when changing logic; leave no `"Phase 1/2/3"` or `"TODO: next phase"` milestone markers inside `src/` source files (phase tracking belongs in `notes/`, never in code comments).

---

## 3. Standard Execution Loop Per Phase

When executing **Phase-N**:

1. **Check Scope Lock:** Read Phase-N's Allowed Files and Locked/Untouched boundaries in `02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md`.
2. **Implement Strictly Within Scope:** Apply only changes authorized for Phase-N. Do not "drive-by refactor" unrelated subsystems.
3. **Static & Test Gates (Mandatory after edits):**
   - `npm run typecheck` (`wrangler types` + `tsc -p test/tsconfig.json --noEmit`)
   - `npm run test` (Node pure unit tests)
   - Targeted Vitest worker suites relevant to Phase-N (e.g., `github-feel.worker.test.ts`, `system-admin.worker.test.ts`, `vibtools-profile.worker.test.ts`, `demo-user-mock-repo.worker.test.ts`, `auth-session.worker.test.ts`)
   - `compile_applet` + `lint_applet`
4. **Visual Browser Critique (Required for UI Phases `01`–`06`):**
   - Restart dev server (`restart_dev_server`) so updated bundle serves on port 3000.
   - Verify rendered desktop (`1440x900`) and responsive/mobile (`390x844`) views via `playwright-cli` in **dark mode AND light mode**, plus check browser console for errors/4xx/5xx surprises.
   - Remove temporary `.playwright-cli/` artifacts after inspection.
5. **Update Tracking Logs Before Finishing Phase:**
   - Record exact summary, verification results, and Scope Lock sign-off in `04-PHASE-COMPLETION-LOG.md`.
   - Update feature statuses in `06-ACTUAL-IMPLEMENTATION-STATUS.md` (and `05-ERROR-HANDLING.md` if error handlers changed).
