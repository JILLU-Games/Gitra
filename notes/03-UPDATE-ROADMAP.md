# 03 — Phased Update Roadmap (`A–Z`, `002`)

> **Strategy:** Execute one locked phase at a time. Never combine unrelated UI/backend refactors into a single pass. Each phase ends with `typecheck` + automated tests + live browser screenshot verification before advancing.

---

## Roadmap Overview (`Phase-01` → `Phase-06`)

```text
[Phase-00: Baseline Freeze] (DONE)
   └──► [Phase-01: Typography, Palette & Radius System]
           └──► [Phase-02: Header + GitHub-Style Repo Nav & Admin RBAC Gate]
                   └──► [Phase-03: Public Profile /{owner} Tabs & Privacy Polish]
                           └──► [Phase-04: Users Panel /user/* Cleanup & CTA Removal]
                                   └──► [Phase-05: Error Handling Hardening & Secondary Pages]
                                           └──► [Phase-06: Responsive, Light/Dark & Full Production Sign-Off]
```

---

## Phase-01 — Design System Foundation (Fonts, Cool-Slate Palette & Unified Radii)

- **Goal:** Replace uneven Segoe/plum-dark tokens and mixed `rounded-xl`/`rounded-2xl` bloat with crisp GitHub/Forgejo-grade `Hanken Grotesk` + `JetBrains Mono`, cool charcoal-slate surfaces, restrained Forge Blue accent, and unified `6px` (`rounded-md`) radius geometry.
- **Concrete Tasks:**
  1. Update `src/client/server/document.tsx` `<head>` font import to fetch `Hanken Grotesk:wght@400;500;600;700` and `JetBrains+Mono:wght@400;500`.
  2. Update `src/client/styles/app.css`:
     - Set `--font-sans` & `--font-display` to `"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
     - Replace `font-weight: 450` on `body` with `400` + `text-sm leading-normal antialiased`.
     - Calibrate dark neutrals (`--color-canvas: #0d1117`, surface `#161b22`, header `#010409`, border `#30363d`, muted text `#8b949e`, primary text `#eef2f6`) and light neutrals (`#ffffff`, `#f6f8fa`, `#d0d7de`, `#1f2328`).
     - Shift accent from saturated `#6366f1` indigo-purple to crisp Forge Blue (`#1f6feb` / `#388bfd` / `#58a6ff` / `#0969da`) so buttons, focus rings, and links match professional developer tools.
     - Tighten `.prose` / `.markdown-content` blockquote & `.diff-viewer` (`rounded-md`, subtle borders).
  3. Normalize `src/client/components/ui/` primitives (`button.tsx`, `card.tsx`, `input.tsx`, `badge.tsx`, `page-header.tsx`) to `rounded-md` with crisp spacing and light/dark borders.
- **Acceptance Criteria:**
  - `Hanken Grotesk` + `JetBrains Mono` loaded in SSR HTML; computed `font-family` resolves cleanly.
  - Zero `rounded-2xl` / `rounded-xl` on UI buttons, inputs, cards, or diff viewers.
  - Dark & light palettes maintain >= 4.5:1 text contrast.
- **Verification Gate:** `npm run typecheck`, `npm run test`, `compile_applet`, Playwright dark/light capture on `/` and `/alex-dev/cloud-forge-kit`.

---

## Phase-02 — Header, Repo Navigation Bar & `Admin` RBAC Gate (Fixes Screenshot 1 Red Box)

- **Goal:** Fix the single biggest functional/visual defect in Screenshot 1: replace the floating right-hand pill box (`Browse | Commits | Admin`) with a proper GitHub-style full-width underline repo tab bar, and strictly hide repo `Settings` (`Admin`) from anonymous visitors and non-member viewers.
- **Concrete Tasks:**
  1. Add a canonical helper in `src/worker/routes/ui/helpers.ts` (reusing existing `viewerIsNamespaceMember` + `canAccessAdminPanel`): `canViewerManageRepo(c, viewer, route)` returning `boolean` without violating single-hop rules.
  2. Thread `canManageRepo: boolean` through `overview.ts`, `tree.ts`, `blob.ts`, `commits.ts`, `adminPage.ts` to `OverviewPage`, `TreePage`, `BlobPage`, `CommitsPage`, `CommitPage`, and `AdminPage`.
  3. Update `RepoNav.tsx`:
     - Add `canManageRepo?: boolean` to `RepoNavProps`.
     - Render owner/repo breadcrumb (`alex-dev / cloud-forge-kit` + `Public`/`Private` badge) cleanly aligned in a GitHub-style repo header strip, followed by full-width bottom-bordered horizontal tabs:
       - `<> Code` (`/${owner}/${repo}` — active on `overview` & `browse`)
       - `Commits` (`/${owner}/${repo}/commits?ref=${refEnc}`)
       - `Settings` (`/${owner}/${repo}/admin`) — **rendered ONLY when `canManageRepo === true`**!
     - Keep `RefPickerIsland` cleanly positioned below tabs on browse/tree/blob pages without duplicating `1 branch` / `0 tags` counters in 3 places.
  4. Update `OverviewPage.tsx`, `TreePage.tsx`, `BlobPage.tsx`:
     - Replace `text-amber-600 dark:text-amber-400` folder icons with clean slate/sky blue (`text-sky-600 dark:text-sky-400` / `text-zinc-500 dark:text-zinc-400`) matching GitHub/Forgejo.
     - Remove redundant `History` / `Browse tree` clutter where unified tab navigation covers it, while keeping commit strip (`main · 12 items`, latest commit message & commit link) sharp and scannable.
     - Tighten `header.tsx` height (`h-13`), subtle `#010409` dark surface border, and compact action links.
- **Acceptance Criteria:**
  - Anonymous user viewing `/alex-dev/cloud-forge-kit` does **NOT** see `Admin` or `Settings` tab.
  - Non-owner signed-in `viewer` does **NOT** see `Settings` tab.
  - Repo owner (`admin` with namespace membership) **DOES** see `Settings` tab and can open `/${owner}/${repo}/admin`.
  - No `font-mono` used on normal count labels (`12 items`, branch count prose).
- **Verification Gate:** `npm run typecheck`, `test/github-feel.worker.test.ts`, `test/git-acl.worker.test.ts`, `compile_applet`, Playwright captures (logged out vs signed in as admin).

---

## Phase-03 — Public Profile (`/{owner}`) Tab & Layout Restructuring (Fixes Screenshots 2 & 7)

- **Goal:** Match the clean two-tab structure of GitHub (Screenshot 3), Gitea (Screenshot 4), and Forgejo (Screenshot 6) where `Overview` owns `.vibtools` `profile/README.md` + `Pinned` / popular repos, and `Repositories` owns searchable repo directory—and clean up internal role/dotfile clutter.
- **Concrete Tasks:**
  1. Update `OwnerPage.tsx`:
     - Keep profile header crisp and minimal: Avatar initial/badge, Display Name (`Alex Rivera`), `@handle`, concise bio, repo count (`2 repositories · 2 public`), location, website link.
     - Hide internal RBAC `MEMBER` pill from anonymous public visitors (show role indicator only to authenticated admins if useful, or remove from public profile card completely).
     - Remove `.vibtools` text link clutter from header metadata row (keep `.vibtools` setup CTA strictly for `isOwner && !hasProfileRepo` in Overview tab).
     - Pass `profileReadme` + `profileRepoProps` inside `OwnerReposIsland` props instead of rendering the large `.vibtools` README block above the tabs.
  2. Update `OwnerReposIsland` (`src/client/islands/owner-profile.tsx`):
     - Render `Overview` | `Repositories (N)` underline tab bar right under the compact profile header.
     - **`Overview` tab:** Renders `.vibtools` `profile/README.md` card (if present; or clean compact CTA for owner if missing) + `Pinned repositories` grid (max 6, 2-column grid matching GitHub/Gitea!). Do NOT repeat the entire searchable repository table below Pinned on Overview.
     - **`Repositories` tab:** Renders search input + visibility filter (`All` / `Public` / `Private`) + clean full repository list with pin/unpin controls for owner.
- **Acceptance Criteria:**
  - Switching from `Overview` to `Repositories` hides `.vibtools` README so the repo list is immediately at top of viewport.
  - Anonymous visitor on `/alex-dev` sees zero `MEMBER` pill and zero redundant repository list on `Overview`.
  - `.vibtools` README formatting, edit link (for owner), and pin toggling continue to work seamlessly.
- **Verification Gate:** `npm run typecheck`, `test/vibtools-profile.worker.test.ts`, `test/demo-user-mock-repo.worker.test.ts`, `test/github-feel.worker.test.ts`, Playwright check on `/alex-dev` switching tabs.

---

## Phase-04 — Users Panel (`/user/*`) Cleanup & Navigation Purity

- **Goal:** Eliminate leaked admin CTAs, duplicate profile links, and redundant navigation clutter inside `/user/*` so the User Panel looks cleanly separated from `/admin/*`.
- **Concrete Tasks:**
  1. `src/client/pages/AccountPage.tsx`:
     - Remove `Site Administration` button (`/admin`) from `/user/*` page header completely (`Control Panel` remains in top header `@username` menu for admins).
     - Deduplicate `Public page ↗` vs `ProfileSettingsIsland`'s `Open /@{handle} ↗`: keep one clean link in `AccountPage` header (`Public profile ↗`) and remove the duplicate from `profile-settings.tsx` card header.
     - Ensure `viewerRole` non-write (`viewer`) restrictions still hide `New repository` and `push` PAT scope cleanly.
  2. `src/client/components/UserSettingsLayout.tsx`:
     - Remove redundant `Back to Repositories` footer CTA (top header already provides `Repositories`).
     - Tighten sidebar labels and grouping (`Profile`, `Repositories`, `Settings`, `Security`, `Access Tokens`) with consistent `rounded-md` active rail matching `AdminSettingsLayout.tsx`, plus responsive mobile slide-over drawer.
  3. Harmonize `/user/profile` vs `/user/account` vs `/user/settings` content blocks so switching sidebar links never feels repetitive or bloated.
- **Acceptance Criteria:**
  - Zero `Site Administration` / `/admin` CTA buttons inside `/user/*` main content or sidebar.
  - Zero duplicate `Public page ↗` / `Open /handle ↗` links on `/user/profile`.
  - Mobile (`<640px`) uses slide-over left drawer trigger (never horizontal top tabs).
- **Verification Gate:** `npm run typecheck`, `test/admin-panel.test.ts`, `test/demo-user-mock-repo.worker.test.ts`, `test/d1-session.worker.test.ts`, Playwright check across `/user/profile`, `/user/settings/tokens`, and `/admin` at `1440px` & `390px`.

---

## Phase-05 — Error Handling Hardening & Remaining Pages Alignment (`004`)

- **Goal:** Close every error-handling gap documented in `05-ERROR-HANDLING.md` and bring secondary pages (`HomePage`, `AuthSignInPage`, `ErrorPage`, `NotFoundPage`, `Admin*Page`) into exact alignment with the Phase-01 design system.
- **Concrete Tasks:**
  1. Refactor `src/client/server/error.ts`:
     - Remove `as any` casts (`AGENTS.md` compliance).
     - Ensure SSR error fallback emits safe escaped HTML shell if `renderUiView` fails instead of bare unstyled `<h2>Error</h2>`.
  2. Improve global `app.onError` in `src/worker/index.ts:192-200`:
     - Content-negotiate: return JSON `{ error }` for API/Git/fragment paths (`*/api/*`, `/auth/api/*`, `/admin/api/*`, `/commits/fragments/*`, `/commit/*/diff`), and clean rendered `ErrorPage` HTML (`500`) for browser navigation requests!
  3. Surface non-swallowed warnings/UI feedback for broken DO RPC / cache misses in `overview.ts` / `tree.ts` / `helpers.ts` where safe without altering `404`/`403` security contracts (`git-acl.worker.test.ts`).
  4. Align `HomePage.tsx`, `AuthSignInPage.tsx`, `ErrorPage.tsx`, `NotFoundPage.tsx`, `AdminSettingsPage.tsx`, `AdminSecurityPage.tsx`, and `AdminSettingsLayout.tsx` typography (`font-sans` for titles, crisp `rounded-md` geometry, clean spacing).
- **Acceptance Criteria:**
  - Zero `as any` in `src/client/server/error.ts`.
  - Browser request triggering an unhandled worker error renders themed `ErrorPage` HTML (`500`) while API routes still return JSON `{ error }` (`500`).
  - Zero `Admin` CTA in `/user/*`; `/admin/*` pages keep full responsive compact sidebar.
- **Verification Gate:** `npm run typecheck`, `npm run test`, `npm run test:workers`, `compile_applet`, `lint_applet`.

---

## Phase-06 — Full Regression, Responsive, Dark/Light & Production Verification

- **Goal:** Verify the complete application end-to-end across all roles (`anonymous`, `viewer`, `@alex-dev` `member`, `@admin` `admin`), both viewports (`1440x900`, `390x844`), and both themes (`dark`, `light`).
- **Concrete Tasks:**
  1. Run Prettier check (`npm run format:check` / `npm run format` if needed on modified files).
  2. Run complete unit + worker integration suite (`npm run typecheck && npm run test && npm run test:workers`, excluding opt-in `PACK_INDEXER_FIXTURE` unless requested).
  3. Execute full Playwright verification sweep (`dark` & `light`, desktop & mobile) covering:
     - `/`, `/explore`, `/auth`
     - `/alex-dev` (`Overview` + `Repositories` tabs)
     - `/alex-dev/cloud-forge-kit` (anonymous vs owner `Settings` tab visibility, `Tree`, `Blob`, `Commits`, `Commit diff`)
     - `/user/profile`, `/user/settings/tokens`, `/user/settings/security` (desktop + mobile drawer)
     - `/admin`, `/admin/users`, `/admin/repositories`, `/admin/tokens`, `/admin/settings`, `/admin/security`
  4. Verify zero console/network errors on normal user flows and remove `.playwright-cli/` temp files.
  5. Finalize `04-PHASE-COMPLETION-LOG.md` & `06-ACTUAL-IMPLEMENTATION-STATUS.md` for production readiness sign-off.
