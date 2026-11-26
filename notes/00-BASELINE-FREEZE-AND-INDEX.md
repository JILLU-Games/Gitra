# 00 — BASELINE FREEZE & DOCUMENTATION INDEX

- **Freeze Timestamp**: `2026-11-26`
- **Baseline Reference**: Post-Initial-Remediation Live Tree + Fresh Forensic Audit (`/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md`)
- **Total Verified Findings in Baseline**: `12` (`BUG-NEW-01` through `BUG-NEW-12`)
- **Planned Remediation Phases**: `4` Sequential Scope-Locked Phases (`Phase 01` through `Phase 04`)
- **Current Implementation State**: `Baseline Frozen — 0 / 4 Phases Executed (Ready for Phase 01)`

---

## 1. Baseline Freeze Verification Snapshot

The current project source tree (`src/**`, `drizzle/**`, `test/**`, `wrangler.jsonc`, `package.json`) is frozen as the **Pre-Phase-01 Baseline**.

| Verification Gate                              | Command                                                                    | Baseline Status                          |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Full Bundle Build (Client + SSR + Worker)      | `npm run build`                                                            | **PASS**                                 |
| Strict Global Typecheck (`test/**` + `src/**`) | `npx tsc --noEmit`                                                         | **PASS (`0` errors)**                    |
| Cloudflare Worker & Client Typecheck           | `npm run typecheck`                                                        | **PASS (`0` errors)**                    |
| Prettier Code Formatting Check                 | `npm run format:check`                                                     | **PASS**                                 |
| Node Unit Test Suite (`vitest.unit.config.ts`) | `npm run test`                                                             | **PASS (`14/14` suites, `74/74` tests)** |
| Standalone Pure Logic Audit Suite              | `npx --yes tsx --test test/phase04-logic.node-test.ts`                     | **PASS (`5/5` tests)**                   |
| Worker Integration Smoke Test (`github-feel`)  | `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts` | **PASS (`1/1` test)**                    |

---

## 2. Complete Index of `/notes/` Forensic & Planning Documents

| Document Path                                | Purpose & Scope                                                                                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md` | Ground-up forensic source-code audit report with exact file paths, line numbers, and verbatim code block proofs for all 12 findings (`BUG-NEW-01` .. `BUG-NEW-12`).                                                                    |
| `/notes/00-BASELINE-FREEZE-AND-INDEX.md`     | **(This File)** Baseline freeze declaration, verification snapshot, bug-to-phase mapping table, and strict Scope-Lock rules.                                                                                                           |
| `/notes/01-PRODUCTION-FIX-PATCH-SPEC.md`     | **(Requirement 001)** Exact file paths, line numbers, verbatim BEFORE code blocks, exact AFTER code patch specifications, and strict Scope Lock for all 12 bugs (`BUG-NEW-01` .. `BUG-NEW-12`).                                        |
| `/notes/02-PHASED-UPDATE-ROADMAP.md`         | **(Requirement 002)** A–Z step-by-step phased implementation roadmap (`Phase 01` through `Phase 04`) with per-phase scope locks, allowed/forbidden files, and verification commands.                                                   |
| `/notes/03-PHASE-EXECUTION-LOG.md`           | **(Requirement 003)** Live phase execution tracker recording completed phases (`0 / 4`), remaining phases (`4 / 4`), exact features/fixes per phase, and post-phase audit sign-offs.                                                   |
| `/notes/04-ERROR-HANDLING-INVENTORY.md`      | **(Requirement 004)** Complete inventory of existing error handling across all subsystems (`HTTP`, `Git v2`, `DO`, `D1`, `R2`, `KV`, `SSR`) plus exact new error handling to be added in `BUG-NEW-08`, `BUG-NEW-09`, and `BUG-NEW-10`. |
| `/notes/05-ACTUAL-IMPLEMENTATION-STATUS.md`  | **(Actual Implementation Matrix)** Subsystem-by-subsystem ledger of features currently working in Production & Demo Mode, what each phase upgrades, and what remains pending.                                                          |

---

## 3. Master Bug-to-Phase Alignment Matrix (`BUG-NEW-01` .. `BUG-NEW-12`)

Every single finding in `/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md` is mapped 1-to-1 to an exact remediation phase:

| Bug ID       | Severity       | Target Phase | Exact Target Source File(s)                                                                                                                                                                            | Core Fix Summary                                                                                                                                                                                                                                                  |
| ------------ | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUG-NEW-01` | **CRITICAL**   | **Phase 01** | `src/worker/db/d1/dal/namespaces.ts`                                                                                                                                                                   | Prioritize user-owned namespaces (`ns.createdBy === userId`) before alphabetical sorting in `listNamespacesForUser` so admin-created users never hijack `viewer.primaryNamespaceSlug` or `/user/profile` updates.                                                 |
| `BUG-NEW-02` | **HIGH**       | **Phase 01** | `src/worker/routes/ui/helpers.ts`, `src/worker/routes/ui/overview.ts`, `src/worker/db/d1/dal/repositories.ts`                                                                                          | Honor `canAccessAdminPanel(viewer.role)` in `resolveAdminPageRepoAccess`, `resolveAdminApiRepoAccess`, `resolveUiRepoAccess`, and `handleOwnerOverview` so Site Admins can open `"Storage"` (`/:owner/:repo/admin`) and view private repos across all namespaces. |
| `BUG-NEW-03` | **HIGH**       | **Phase 01** | `src/worker/routes/authRepositories.ts`                                                                                                                                                                | Allow Site Admins (`canAccessAdminPanel(viewer.role)`) in `handleCommitProfileReadme` (`PUT /auth/api/repositories/:id/profile-readme`) and `handleCommitRepositoryFile` (`PUT /auth/api/repositories/:id/file`).                                                 |
| `BUG-NEW-04` | **HIGH**       | **Phase 02** | `src/worker/git/commitFile.ts`                                                                                                                                                                         | Enqueue `{ kind: "compaction", doId, repoId }` on `env.REPO_TASKS_QUEUE` inside `commitRepositoryFile` when `finalized.shouldQueueCompaction` is true.                                                                                                            |
| `BUG-NEW-10` | **MEDIUM**     | **Phase 02** | `src/worker/git/commitFile.ts`, `src/worker/routes/authRepositories.ts`                                                                                                                                | Preserve existing executable file mode (`100755` vs `100644`) in `upsertTreePath`, and reject path conflicts when an intermediate segment is a non-directory or the target leaf is an existing directory/submodule/symlink.                                       |
| `BUG-NEW-05` | **HIGH**       | **Phase 03** | `src/worker/routes/admin.ts`                                                                                                                                                                           | In `PUT /:owner/:repo/admin/head` and `PUT /:owner/:repo/admin/refs`, update `repositories.updatedAt` in D1, delete `repo-branch:<repositoryId>` from `ROUTES` KV, and purge `/_cache/refs`.                                                                      |
| `BUG-NEW-06` | **MEDIUM**     | **Phase 03** | `src/worker/tasks/repositoryDelete.ts`, `src/worker/repositories/routeCache.ts`                                                                                                                        | Delete `repo-branch:<repositoryId>` from `env.ROUTES` KV during `handleRepositoryDeleteMessage`.                                                                                                                                                                  |
| `BUG-NEW-07` | **MEDIUM**     | **Phase 03** | `src/worker/auth/demoSeed.ts`                                                                                                                                                                          | Only write public demo repositories (`args.spec.visibility === "public"`) into `ROUTES` KV in `seedSingleDemoRepository`, and check `listRepositoriesInNamespace(args.db, args.namespaceId)` in `ensureDemoRepositoriesSeeded`.                                   |
| `BUG-NEW-12` | **LOW-MEDIUM** | **Phase 03** | `src/worker/git/commitFile.ts`, `src/worker/routes/git.ts`                                                                                                                                             | Delete `repo-branch:<repositoryId>` from `ROUTES` KV on web commit and CLI `git push`, and align `commitFile.ts` README cache invalidation with `commitOid` + cache version.                                                                                      |
| `BUG-NEW-08` | **MEDIUM**     | **Phase 04** | `src/client/server/error.ts`, `src/worker/routes/ui/helpers.ts`, `src/worker/routes/ui/tree.ts`, `src/worker/routes/ui/blob.ts`, `src/worker/routes/ui/commits.ts`, `src/worker/routes/ui/overview.ts` | Load custom `branding` and preserve signed-in `viewer` across `handleError`, `badRequest`, and `tree.ts` 404 responses; sanitize 500 error messages when `LOG_LEVEL !== "debug"`.                                                                                 |
| `BUG-NEW-09` | **MEDIUM**     | **Phase 04** | `src/worker/routes/ui/refsApi.ts`, `src/worker/routes/admin.ts`                                                                                                                                        | Sanitize 500 JSON responses to `"Internal Server Error"`, add `Cache-Control: no-store`, and emit structured warning logs in `handleRefsApi` and the 5 remaining unhardened endpoints in `routes/admin.ts`.                                                       |
| `BUG-NEW-11` | **LOW-MEDIUM** | **Phase 04** | `src/worker/routes/ui/blob.ts`                                                                                                                                                                         | Load `const progress = await loadUiRepoActivity(env, access)` in `handleBlob` and pass `progress` to `renderBlobDocumentResponse`.                                                                                                                                |

---

## 4. Strict Scope-Lock Governance Rules

1. **One Phase at a Time**: Each phase is executed only after explicit user approval of its command prompt.
2. **Exact File Boundary Enforcement**: Only the files listed in that phase's Scope Lock table may be modified during that phase. All other application features, UI components, styles, and routes remain 100% untouched.
3. **Post-Patch Forensic Self-Audit**: Immediately after applying a phase's patches, the modified files and tests are re-audited and verified with `npm run typecheck`, `npx tsc --noEmit`, `npm run test`, and `npm run format:check`.
4. **Live Markdown Ledger Updates**: At the end of every phase, `/notes/03-PHASE-EXECUTION-LOG.md`, `/notes/04-ERROR-HANDLING-INVENTORY.md`, and `/notes/05-ACTUAL-IMPLEMENTATION-STATUS.md` are updated with exact completion proof.
