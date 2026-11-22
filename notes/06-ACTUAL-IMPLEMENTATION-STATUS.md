# 06 — Actual Implementation Status Matrix

> **Baseline Reference:** `v0.1.0` (`2026-11-22`)
> **Purpose:** Honest, code-verified ledger of what works end-to-end today, what works with UI/UX/RBAC defects targeted in `Phase-01`–`Phase-05`, and what remains outside current scope. Update after every phase!

---

## Status Legend

- `WORKING` — Verified implemented end-to-end in code + tests.
- `WORKING (DEFECT)` — Core functionality works, but has confirmed UI/Typography/RBAC/UX bug (see Phase column).
- `PARTIAL / HARDEN` — Implemented with error-handling or edge-case gap (see `05-ERROR-HANDLING.md`).
- `NOT IMPLEMENTED` — Not in codebase yet.

---

## 1. Core Git Engine, Storage & Protocol Features

| Capability                                                                        | Status    | Exact Modules / Proof                                                 | Target Fix Phase   |
| --------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- | ------------------ |
| Git Smart HTTP v2 (`info/refs`, `upload-pack`, `receive-pack`)                    | `WORKING` | `src/worker/routes/git.ts`, `uploadStream.ts`, `streamReceivePack.ts` | Unchanged (Locked) |
| Repo Durable Object SQLite + R2 Pack Storage + Compaction                         | `WORKING` | `src/worker/do/repo/*`, `src/worker/git/pack/*`                       | Unchanged (Locked) |
| Edge Cache + Request Coalescing + Limiter Subrequest Budget                       | `WORKING` | `src/worker/cache/*`, `src/worker/git/operations/limits.ts`           | Unchanged (Locked) |
| Git PAT Auth (`Basic` auth, `pull` vs `push`, non-disclosure `404`)               | `WORKING` | `src/worker/auth/gitAuth.ts`, `test/git-acl.worker.test.ts`           | Unchanged (Locked) |
| Background Queue Consumer (`compaction`, `route-cache-sync`, `repository-delete`) | `WORKING` | `src/worker/tasks/queue.ts`                                           | Unchanged (Locked) |

---

## 2. Authentication, Directory, RBAC & User Account Features

| Capability                                                                                    | Status    | Exact Modules / Proof                                                                          | Target Fix Phase                                 |
| --------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Sign In (`@admin` + directory users), Quick Demo Login, Sign Up, Sign Out                     | `WORKING` | `src/worker/routes/authLogin.ts`, `AuthSignInPage.tsx`                                         | `Phase-05` (Completed `2026-11-22`)              |
| HMAC-Signed Partitioned Session Cookies + Password Hashing (`PBKDF2-SHA256`)                  | `WORKING` | `src/worker/auth/session.ts`, `src/worker/auth/passwords.ts`                                   | Unchanged (Locked)                               |
| D1 Session Bookmark Consistency (`first-primary` / `first-unconstrained`)                     | `WORKING` | `src/worker/routes/d1Bookmark.ts`, `test/d1-session.worker.test.ts`                            | Unchanged (Locked)                               |
| Personal Access Tokens (`namespace` & `repo` scope, `pull`/`push`, revoke)                    | `WORKING` | `src/worker/routes/authTokens.ts`, `src/client/islands/tokens.tsx`                             | `Phase-04` & `Phase-05` (Completed `2026-11-22`) |
| RBAC Roles (`admin`, `member`, `viewer`) + Disabled User Immediate Revocation                 | `WORKING` | `src/shared/admin/panel.ts`, `auth/session.ts`, `AdminSecurityPage.tsx`, `canViewerManageRepo` | `Phase-02` Complete (RepoNav RBAC gated)         |
| Dev Seeded Demo User (`@alex-dev`) + Mock Repo (`cloud-forge-kit`) + `.vibtools`              | `WORKING` | `src/worker/auth/demoSeed.ts`, `test/demo-user-mock-repo.worker.test.ts`                       | Unchanged                                        |
| Dedicated `/user/*` Routes (`/user/profile`, `/account`, `/settings`, `/security`, `/tokens`) | `WORKING` | `src/worker/routes/authTokens.ts:91-106`, `AccountPage.tsx`, `UserSettingsLayout.tsx`          | `Phase-04` (Completed `2026-11-22`)              |
| Public Profile `/{username}` + `.vibtools/profile/README.md` Rendering & Web Editor           | `WORKING` | `src/worker/routes/ui/overview.ts`, `OwnerPage.tsx`, `owner-profile.tsx`                       | `Phase-03` (Completed `2026-11-22`)              |
| Pin / Unpin Repositories on Owner Profile                                                     | `WORKING` | `src/worker/routes/authRepositories.ts`, `owner-profile.tsx`                                   | `Phase-03` (Completed `2026-11-22`)              |

---

## 3. Repository Web UI & Admin Control Panel

| Capability                                                                                     | Status    | Exact Modules / Proof                                                                                                     | Target Fix Phase                                 |
| ---------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Design System (Typography, Dark/Light Surface Palette, Radius Scale)                           | `WORKING` | `document.tsx`, `app.css`, `components/ui/*` (`Hanken Grotesk`, `#0d1117`/`#161b22` cool slate, Forge Blue, `rounded-md`) | `Phase-01` (Completed `2026-11-22`)              |
| Top Navigation Header & User Dropdown                                                          | `WORKING` | `src/client/components/header.tsx` (`#010409` header contrast), `header-menus.tsx`                                        | `Phase-02` (Completed `2026-11-22`)              |
| Repository Sub-Nav (`Code`, `Commits`, `Settings`)                                             | `WORKING` | `src/client/components/RepoNav.tsx`, `canViewerManageRepo` + `test/github-feel.worker.test.ts`                            | `Phase-02` (Completed `2026-11-22`)              |
| Repo Overview (`README.md`, Tree Preview, Clone URL, Web File Editor)                          | `WORKING` | `OverviewPage.tsx` (slate-blue folders, clean counts, `rounded-md`), `repo-overview-actions.tsx`                          | `Phase-02` & `Phase-05` (Completed `2026-11-22`) |
| Tree Browser, Highlighted Blob Viewer, Web Blob Editor, Raw Stream                             | `WORKING` | `TreePage.tsx`, `BlobPage.tsx`, `blob-editor.tsx`, `ui/raw.ts` (`rounded-md`, slate folders, structured error logging)    | `Phase-02` & `Phase-05` (Completed `2026-11-22`) |
| Commits List, Merge Side Expander, Commit Diff & File Patch Viewer                             | `WORKING` | `CommitsPage.tsx`, `CommitPage.tsx`, `ui/commits.ts`                                                                      | `Phase-02` (Completed `2026-11-22`)              |
| Admin Control Panel (`/admin`, `/users`, `/repositories`, `/tokens`, `/settings`, `/security`) | `WORKING` | `src/worker/routes/systemAdmin.ts`, `AdminSettingsLayout.tsx`, `Admin*Page.tsx`                                           | `Phase-01` & `Phase-05` (Completed `2026-11-22`) |
| Responsive Left Sidebar & `<640px` Slide-Over Drawer (Admin & User Panels)                     | `WORKING` | `AdminSettingsLayout.tsx`, `UserSettingsLayout.tsx`, `sidebar-shell.ts`                                                   | `Phase-04` & `Phase-06` (Completed `2026-11-22`) |
| Repo Admin Page (`/:owner/:repo/admin` — Refs, HEAD, Compaction, Packs, Purge)                 | `WORKING` | `AdminPage.tsx`, `ui/adminPage.ts`, `routes/admin.ts`, `islands/repo-admin/*`                                             | `Phase-02` (Completed `2026-11-22`)              |
| Global SSR Error Boundary & Safe Client Error Prompts                                          | `WORKING` | `src/worker/index.ts`, `src/client/server/error.ts`, `test/error-handling.test.ts`, `test/error-boundary.worker.test.ts`  | `Phase-05` (Completed `2026-11-22`)              |

---

## 4. Intentionally Out-of-Scope / Non-Goals (Unless Explicitly Requested Later)

- Pull Requests / Merge Requests / Issues / CI Runner Execution (static `.github/workflows` example files exist in mock repo only for UI browsing).
- Multi-user Repo Collaborator Invites outside Namespace Membership (access control currently operates at Namespace + PAT + Directory Role level).
- SSH Git Transport (HTTPS Git Smart HTTP v2 + PAT only on Cloudflare Workers).
