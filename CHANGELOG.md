# Changelog

All notable changes to **`git-on-cloudflare`** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.0] — 2026-11-22

### Production UI, RBAC, Profile & Error-Handling Upgrade (`Phase-01` → `Phase-06`)

#### Added

- **Design System Foundation (`Phase-01`):**
  - Integrated **`Hanken Grotesk`** (`400;500;600;700`) and **`JetBrains Mono`** (`400;500`) web fonts in `src/client/server/document.tsx` and `src/client/styles/app.css`.
  - Calibrated cool-slate dark theme tokens (`#0d1117` canvas, `#161b22` elevated surface, `#010409` header, `#30363d` border), crisp light-mode tokens (`#ffffff` / `#f6f8fa` / `#d0d7de`), and Forge Blue (`#1f6feb` / `#388bfd` / `#58a6ff`) accents.
  - Standardized UI primitives (`Button`, `Card`, `Input`, `Badge`, `PageHeader`, code blocks, diff containers) to unified `rounded-md` (`6px`) geometry.
- **GitHub-Style Repository Navigation & RBAC Gate (`Phase-02`):**
  - Redesigned `RepoNav.tsx` into a two-tier repository header with full-width bottom-bordered underline tabs (`<> Code`, `Commits`, and conditional `Settings`).
  - Added canonical `canViewerManageRepo()` helper in `src/worker/routes/ui/helpers.ts` and threaded `canManageRepo` across `overview.ts`, `tree.ts`, `blob.ts`, `commits.ts`, and `adminPage.ts` so `Settings` (`/:owner/:repo/admin`) is hidden from anonymous visitors and non-owner viewers.
  - Updated directory folder icons to cool Forge Blue and tightened `#010409` top header contrast.
- **Public Profile (`/:owner`) Two-Tab Workspace & Privacy Hardening (`Phase-03`):**
  - Restructured `OwnerPage.tsx` and `OwnerReposIsland` (`src/client/islands/owner-profile.tsx`) into a clean `Overview` vs `Repositories (N)` two-tab layout.
  - Placed `.vibtools/profile/README.md` and the 2-column `Pinned` repositories grid exclusively inside the `Overview` tab, and dedicated the `Repositories` tab to the searchable/filterable (`All | Public | Private`) repository directory.
  - Hidden internal RBAC role pills (`MEMBER` / `VIEWER`) from anonymous public profile visitors.
- **Users Panel (`/user/*`) Navigation Purity (`Phase-04`):**
  - Removed leaked `Site Administration` (`/admin`) CTA from `AccountPage.tsx`, deduplicated `Public profile ↗` links between `AccountPage.tsx` and `profile-settings.tsx`, removed redundant `Back to Repositories` sidebar footer CTA from `UserSettingsLayout.tsx`, and removed cross-panel `/admin/users` links from `change-password.tsx`.
  - Verified `<640px` mobile slide-over drawer navigation on both `/user/*` and `/admin/*`.
- **Error Handling Hardening & Secondary Pages Alignment (`Phase-05`):**
  - Upgraded `app.onError` in `src/worker/index.ts` with structured `"worker:unhandled-error"` logging and `wantsJsonErrorResponse()` content negotiation (returning JSON `{ error }` for API/Git/fragment requests and styled SSR `ErrorPage` HTML for browser navigations).
  - Refactored `src/client/server/error.ts` to eliminate all `as any` casts via typed helpers (`getErrorMessage`, `getErrorStack`, `resolveErrorStatus`, `isGitReadMissError`) and added `buildEscapedErrorHtmlDocument()` XSS-safe standalone HTML fallback.
  - Replaced silent `catch {}` blocks in `overview.ts`, `tree.ts`, `helpers.ts`, and `raw.ts` with structured `debug`/`warn` logging distinguishing expected `404` path misses from unexpected DO/R2 errors.
  - Added inline HTTP `401` session-expiry prompts (`"Session expired — please sign in again."` with `/auth` link) and clipboard unavailability alerts across client islands.
  - Aligned `HomePage.tsx`, `AuthSignInPage.tsx`, `ErrorPage.tsx`, `NotFoundPage.tsx`, `AdminSettingsLayout.tsx`, `AdminSettingsPage.tsx`, and `AdminSecurityPage.tsx` to `Phase-01` typography and `rounded-md` geometry.
  - Added unit test suite `test/error-handling.test.ts` and worker integration suite `test/error-boundary.worker.test.ts`.
- **Dev Seeded Test User & Mock Repository Workspace:**
  - Added automatic local dev/preview seeding (`src/worker/auth/demoSeed.ts`) for `@alex-dev` (`devuser123`) with `.vibtools/profile/README.md` and `alex-dev/cloud-forge-kit` (full mock starter project structure with `.github/workflows/ci.yml`, `docs/ARCHITECTURE.md`, `src/`, `test/`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, and `LICENSE`).

### Core Platform & Git Engine Foundation

- **Git Smart HTTP v2 Server on Cloudflare Workers:**
  - `ls-refs` and streaming `fetch` (`git-upload-pack`) with R2 range-read pack assembly, per-request pack discovery coalescing, and `Limiter` subrequest budget enforcement.
  - Streaming `git-receive-pack` with single-writer Durable Object receive lease (`503 Retry-After: 10`), direct R2 pack staging, connectivity validation, and atomic ref commits.
- **Storage & Queue Architecture:**
  - `RepoDurableObject` SQLite metadata store via Drizzle ORM (`drizzle-orm/durable-sqlite`).
  - Cloudflare D1 directory for users, namespaces, repositories, 3-tier RBAC (`admin`, `member`, `viewer`), and `SHA-256` hashed Personal Access Tokens (`goc_...`) with D1 session bookmark consistency.
  - Cloudflare Queues background consumer (`compaction`, `route-cache-sync`, `repository-delete`).
