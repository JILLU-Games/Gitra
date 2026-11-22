# 01 — Baseline Freeze & Snapshot (`v0.1.0`)

> **Freeze Timestamp:** `2026-11-22`
> **Workspace Root:** `/app/applet`
> **VCS State:** Uninitialized (`git rev-parse HEAD` → `fatal: not a git repository`; baseline anchored by file manifest, schema, test pass counts, and route inventory below).
> **Rule:** This document represents the exact **Phase-00 Baseline**. Every later change in `Phase-01` → `Phase-06` is measured against this frozen state.

---

## 1. Runtime, Tooling & Package Baseline (`/package.json` & `/wrangler.jsonc`)

| Item                        | Frozen Baseline Value                                                                                                                                                   | Citation                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Package Name / Version      | `git-on-cloudflare` / `0.1.0`                                                                                                                                           | `package.json:2-3`                         |
| Frontend Stack              | React `19.2.6`, Tailwind CSS `4.3.0`, `@tailwindcss/vite` `4.3.0`, `lucide-react` `1.7.0`, `marked` `18.0.3`, `highlight.js` `11.11.1`                                  | `package.json:26-55`                       |
| Backend Runtime             | Hono `4.12.18`, Cloudflare Workers (`compatibility_date: 2026-05-13`, `nodejs_als`), Drizzle ORM `0.45.1`, Zod `4.4.3`, `openid-client` `6.8.4`                         | `package.json:45-56`, `wrangler.jsonc:5-8` |
| Bindings (`wrangler.jsonc`) | `REPO_DO` (SQLite Durable Object), `DB` (D1 `git-on-cloudflare`), `ROUTES` (KV), `REPO_BUCKET` (R2 `git-repos`), `REPO_TASKS_QUEUE`, `ASSETS` (`html_handling: "none"`) | `wrangler.jsonc:24-93`                     |
| TypeScript & Testing        | TypeScript `6.0.0`, Vite `8.0.12`, Vitest `4.1.6`, `@cloudflare/vitest-pool-workers` `0.16.4`                                                                           | `package.json:27-41`                       |

### Baseline Scripts (`package.json:6-24`)

- Dev server: `npm run dev` (`vite dev`, runs on port `3000`)
- Build: `npm run build` (`vite build`)
- Typecheck: `npm run typecheck` (`npm run types:generate && tsc -p test/tsconfig.json --noEmit`)
- Unit tests: `npm run test` (`vitest run --config vitest.unit.config.ts`)
- Worker integration tests: `npm run test:workers` (`vitest run --config vitest.config.ts`)
- Format check: `npm run format:check`

---

## 2. Verified Passing Test & Build Baseline (`2026-11-22`)

At freeze time, all static checks and recently exercised test suites passed:

1. `npm run typecheck` — **PASS**
2. `compile_applet` — **PASS**
3. **Node Unit Suites Verified (`36/36` passing across inspected suites):**
   - `test/admin-panel.test.ts`
   - `test/admin-auth.test.ts`
   - `test/markdown-content.test.ts`
   - `test/web-format.test.ts`
   - `test/pat-format.test.ts`
4. **Worker Integration Suites Verified (`36/36` passing across inspected suites):**
   - `test/demo-user-mock-repo.worker.test.ts`
   - `test/github-feel.worker.test.ts`
   - `test/system-admin.worker.test.ts`
   - `test/d1-session.worker.test.ts`
   - `test/auth-session.worker.test.ts`
5. **Total Test Files Present in `/test/`:** `59` `.test.ts` / `.worker.test.ts` files (`list_dir /test`).

---

## 3. Demo & Seeded Accounts Baseline (`src/worker/auth/demoSeed.ts` & `src/worker/auth/adminAuth.ts`)

| Handle      | Role                    | Password                                 | Seeded Content                                                                                                                                                                     | Status |
| ----------- | ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `@admin`    | `admin` (Primary Admin) | `admin123` (when `ADMIN_PASSWORD` unset) | Instance owner / System Admin                                                                                                                                                      | Active |
| `@alex-dev` | `member`                | `devuser123`                             | `.vibtools` (`profile/README.md`) + `cloud-forge-kit` (GitHub-ready starter repo with `.github`, `docs`, `src`, `test`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`) | Active |

---

## 4. Frozen UI & Routing Surface Inventory

### Worker HTTP Route Registration Order (`src/worker/index.ts:163-183`)

1. `/_diag/repo/:owner/:repo` (dev diagnostic endpoint gated by `ENABLE_DIAG`)
2. `registerAuthRoutes(router)` → mounts:
   - `authLogin.ts`: `GET /auth`, `POST /auth/login`, `POST /auth/demo`, `POST /auth/register`, `POST /auth/logout`, `GET /auth/callback`, `POST /auth/api/password`, `PUT /auth/api/profile`
   - `authTokens.ts`: `GET /user`, `/user/profile`, `/user/account`, `/user/accounts`, `/user/settings`, `/user/settings/security`, `/user/settings/tokens`, `/auth/account`, `/auth/api/tokens`, `POST /auth/api/tokens`, `DELETE /auth/api/tokens/:patId`
   - `authRepositories.ts`: `GET/POST /auth/api/repositories`, `PATCH /auth/api/repositories/:repositoryId`, `PUT /auth/api/repositories/:repositoryId/profile-readme`, `PUT /auth/api/repositories/:repositoryId/file`
3. `registerSystemAdminRoutes(router)` → `GET /admin`, `/admin/repositories`, `/admin/tokens`, `/admin/users`, `/admin/settings`, `/admin/security`, `/admin/SettingsControlPanel` (302 → `/admin/settings`), `/admin/api/overview`, `/admin/api/users`, `/admin/api/namespaces`, `/admin/api/repositories/:repositoryId`
4. `registerAdminRoutes(router)` → `POST/DELETE /:owner/:repo/admin/compact`, `GET/PUT /:owner/:repo/admin/refs|head`, `GET /:owner/:repo/admin/debug-*`, `DELETE /:owner/:repo/admin/pack/:packKey`, `DELETE /:owner/:repo/admin/purge`
5. `registerGitRoutes(router)` → `GET /:owner/:repo/info/refs`, `POST /:owner/:repo/git-upload-pack`, `POST /:owner/:repo/git-receive-pack`
6. `registerUiRoutes(router)` → `GET /`, `/explore`, `/:owner`, `/:owner/:repo`, `/blob`, `/tree`, `/commits`, `/commits/fragments/:oid`, `/commit/:oid`, `/commit/:oid/diff`, `/raw`, `/rawpath`, `/admin`, `/api/refs`
7. `app.notFound` → `renderNotFound(c)`
8. `app.onError` → JSON `{ error: ... }` (`500`)

### Frozen Design Token Baseline (`src/client/server/document.tsx` & `src/client/styles/app.css`)

- **Fonts loaded in `<head>` (`document.tsx:29-32`):** ONLY `JetBrains Mono` (`400;500`). **No sans-serif or serif webfont is actually fetched.**
- **CSS `--font-sans` / `--font-display` (`app.css:10-14`):** `"Segoe UI", system-ui, ...` (UI falls back to host OS default Segoe UI; mono uses `JetBrains Mono`; body has `font-weight: 450` at `app.css:116`).
- **Colors (`app.css:16-40`):**
  - `--color-canvas: #221f21` (warm brownish-plum dark tint)
  - `--color-zinc-900: #1b181a`, `800: #2a2729`, `700: #423f42`, `600: #6e6a6e`
  - `--color-accent-500: #6366f1`, `--color-accent-600: #4f46e5`
  - Light canvas: `--color-canvas-light: #ffffff`
- **Radii Mismatch Across Components:** `rounded-md` (`header.tsx`), `rounded-lg` (`card.tsx`, `AdminSettingsLayout.tsx`, `UserSettingsLayout.tsx`), `rounded-xl` (`button.tsx`, `input.tsx`, `RepoNav.tsx`), `rounded-2xl` (`TreePage.tsx`, `BlobPage.tsx`, `OverviewPage.tsx` clone dialog, `ErrorPage.tsx`, `.prose pre`).

---

## 5. Baseline-to-Audit Alignment Summary

Comparing this frozen baseline directly against screenshots `Screenshot_1` – `Screenshot_7` and `PRODUCT.md`:

- **Matches Baseline:** Seeded `@alex-dev` profile, `.vibtools` `profile/README.md`, `cloud-forge-kit` repository tree/README/markdown rendering, `/user/*` routes, `/admin/*` responsive left-drawer sidebar (`sm:hidden` drawer + persistent `>=640px` sidebar), D1 session & Auth/PAT security boundaries all exist and work functionally.
- **Confirmed Baseline Defects (Tracked in `02-FORENSIC-AUDIT-AND-SCOPE-LOCKS.md`):**
  1. Missing UI sans-serif webfont + synthetic `font-weight: 450` + overused `font-mono` causing weak typography vs GitHub/Gitea/GitLab/Forgejo.
  2. Warm plum/brown zinc neutrals (`#221f21`/`#1b181a`) + amber-yellow folder icons + weak surface border contrast + mixed `rounded-xl`/`rounded-2xl`/`rounded-lg` radii.
  3. **`RepoNav.tsx` RBAC / UI Defect (Red-boxed in Screenshot 1):** `Admin` tab renders unconditionally for anonymous visitors & non-owners inside a cramped floating pill box on the right instead of a full-width GitHub-style repo underline tab strip; also duplicates commit history/branch chrome.
  4. **`OwnerPage.tsx` Profile Hierarchy Defect (Screenshots 2 & 7):** `.vibtools` README sits ABOVE the `Overview | Repositories` tab bar (persists on Repositories tab), public header exposes `MEMBER` badge & `.vibtools` text link to anonymous visitors, and Overview repeats both Pinned and full Repositories directory.
  5. **`AccountPage.tsx` & `UserSettingsLayout.tsx` User Panel Leaks (Prior QA):** Still displays `Site Administration` admin CTA inside `/user/*`, duplicates `Public page ↗` + `Open /handle ↗`, overlaps `Profile`/`Account`/`Settings`, and keeps footer `Back to Repositories` link.
  6. **Silent `catch {}` blocks + unstyled/JSON error fallback leaks (`error.ts`, `index.ts:192`, `overview.ts`, `tree.ts`)** needing clean typed error boundaries.
