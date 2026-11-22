# 02 — Forensic Audit Report & Per-Phase Scope Locks (`001`)

> **Baseline Reference:** `v0.1.0` (`notes/01-BASELINE-FREEZE.md`)
> **Evidence Sources:** Screenshots `1–7` (current app vs GitHub, Gitea, GitLab, Forgejo) + direct source inspection (`src/client/*`, `src/worker/*`).
> **Purpose:** Exact code-level proof for every defect, exact patch direction, and strict **Scope Lock** per phase so no unrelated code is broken.

---

## 1. Visual & Architectural Forensic Findings (With Exact Code Proofs)

### F1. Typography & Font Loading Defect (Screenshots 1, 2, 7 vs GitHub/Gitea/GitLab/Forgejo)

- **Symptom:** Headings, labels, and repo descriptions look thin/uneven ("useless fonts"), metadata is noisy due to arbitrary `font-mono`, and `PRODUCT.md` (`Hanken Grotesk`) / clean `Inter` UI typography is not actually loaded in `<head>`.
- **Code Proof 1 — Missing UI Webfont (`src/client/server/document.tsx:29-32`):**
  ```tsx
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
  />
  ```
  _Only `JetBrains Mono` is loaded; UI sans-serif falls back to local `"Segoe UI"`._
- **Code Proof 2 — Non-standard Font Weight & Fallback Stack (`src/client/styles/app.css:10-14, 114-121`):**
  ```css
  --font-sans:
    "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  --font-display:
    "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  ...
  body {
    font-weight: 450;
  ```
  _`font-weight: 450` is not a native weight on Windows/Linux `"Segoe UI"` or `400;500` JetBrains Mono, causing awkward stroke interpolation._
- **Code Proof 3 — Overused `font-mono` on UI Text:**
  - `src/client/pages/OverviewPage.tsx:221`: file directory count uses `font-mono` (`12 items`); `:390, :403` branch count / list uses `font-mono`.
  - `src/client/pages/OwnerPage.tsx:76`: `@handle` + `:102` repo stats + `:161` repo `visibility` pill + `:187` repo counters.
  - `src/client/pages/AccountPage.tsx`: various non-code metadata labels.
- **Target Fix:** Load `Hanken Grotesk:wght@400;500;600;700` (committed in `PRODUCT.md`) alongside `JetBrains+Mono:wght@400;500` in `document.tsx`; switch `--font-sans`/`--font-display` to `"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`; normalize body weight to `400` (`400/500/600` crisp scale); restrict `font-mono` strictly to commit hashes, OIDs, clone URLs, branches/paths, PAT prefixes, and code blocks.

---

### F2. Palette, Surface Contrast, Folder Icons & Radius Fragmentation

- **Symptom:** Dark theme background has a warm plum/brownish cast (`#221f21` / `#1b181a`) instead of crisp GitHub-slate/charcoal (`#0d1117` / `#161b22` / `#30363d`); primary blue-violet (`#6366f1`) + yellow-amber folder icons clash; border radii jump wildly (`rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`).
- **Code Proof 1 — Warm Plum Zincs & Saturated Indigo (`src/client/styles/app.css:16-40`):**
  ```css
  --color-canvas: #221f21;
  --color-zinc-900: #1b181a;
  --color-zinc-800: #2a2729;
  --color-zinc-700: #423f42;
  --color-accent-500: #6366f1;
  --color-accent-600: #4f46e5;
  ```
- **Code Proof 2 — Yellow-Amber Folder Icons (`src/client/pages/OverviewPage.tsx:67`, `src/client/pages/TreePage.tsx:34`):**
  ```tsx
  <Folder className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
  ```
- **Code Proof 3 — Border Radius Fragmentation:**
  - `src/client/components/ui/button.tsx:26`: `rounded-xl`
  - `src/client/components/ui/input.tsx:10, 13`: `rounded-xl`
  - `src/client/components/ui/card.tsx:12`: `rounded-lg`
  - `src/client/components/RepoNav.tsx:58`: `rounded-xl`
  - `src/client/pages/TreePage.tsx:61` & `src/client/pages/BlobPage.tsx:89`: `rounded-2xl`
  - `src/client/styles/app.css:609` (`.prose pre`): `rounded-2xl`
  - `src/client/components/header.tsx:48, 86, 110`: `rounded-lg` / `rounded-md`
- **Target Fix:** Adopt cool crisp slate neutrals (`canvas #0d1117`, `surface #161b22`, `elevated #1c2128`, `border #30363d`, refined Forge Blue accent `#3b82f6` / `#2563eb` or muted slate-blue `#58a6ff` for links & `#238636` or crisp blue for primary actions); change folder icons to cool slate-blue (`text-sky-400` / `text-slate-400`); standardize UI radius system (`rounded-md` / `6px` for buttons, inputs, tabs, cards, code containers; `rounded-full` only where semantic like small avatar or dot).

---

### F3. Repo Navigation & RBAC Leak (`RepoNav.tsx` — Red-Boxed in Screenshot 1)

- **Symptom:** On `/{owner}/{repo}`, the `Browse | Commits | Admin` bar sits in a disconnected floating pill box on the right, AND **`Admin` is visible to anonymous visitors and non-member viewers** (who see `Sign in` in the top header and have zero admin rights!). Meanwhile `OverviewPage` repeats ref/commits/history chrome below it.
- **Code Proof 1 — Unconditional `Admin` Link (`src/client/components/RepoNav.tsx:71-77`):**
  ```tsx
  <a
    href={`/${owner}/${repo}/admin`}
    className={tabClass("admin")}
    aria-current={currentTab === "admin" ? "page" : undefined}
  >
    <Settings className="h-3.5 w-3.5" aria-hidden="true" />
    <span>Admin</span>
  </a>
  ```
  _`RepoNavProps` (`RepoNav.tsx:15-21`) has NO `canManageRepo?: boolean` prop at all!_
- **Code Proof 2 — Backend Already Knows `canManage`, But Doesn't Thread It Consistently:**
  - `src/worker/routes/ui/overview.ts:288`: computes `canEditRepo = viewer ? await viewerCanWriteRepo(...) : false`, passes `canEditRepo`, NOT `canManageRepo` to `OverviewPage` (`OverviewPage.tsx:100` doesn't pass any permission to `RepoNav`).
  - `src/worker/routes/ui/tree.ts:154-169`, `src/worker/routes/ui/blob.ts:154-171`, `src/worker/routes/ui/commits.ts:100-118`: don't pass `canManageRepo` to `TreePage`, `BlobPage`, `CommitsPage`.
  - Compare `resolveAdminPageRepoAccess` in `src/worker/routes/ui/helpers.ts`: actual repo admin access requires **authenticated admin role + namespace membership**, yet `RepoNav` exposes `/admin` to everyone!
- **Code Proof 3 — Redundant Controls on Repo Overview (`src/client/pages/OverviewPage.tsx:139-156, 240-252`):**
  - Top row (`:139-156`) renders ref selector + `1 branch` + `0 tags`, while sidebar ALSO lists `BRANCHES` and `Branches 1 (default: main)` / `Tags 0`, and file header row (`:240-252`) repeats `History` & `Browse tree` when `Commits` & `Browse`/`Code` belong in a unified top underline repo tab bar (`<> Code`, `Commits`, plus conditional `Settings` only when `canManageRepo === true`).
- **Target Fix:**
  - Add `canManageRepo?: boolean` (computed via existing `canAccessAdminPanel(viewer.role)` + namespace membership helper in `ui/helpers.ts`) across `overview.ts`, `tree.ts`, `blob.ts`, `commits.ts`, `adminPage.ts`.
  - Redesign `RepoNav.tsx` into a full-width GitHub/Gitea-style horizontal underline sub-header (`<> Code`, `Commits`, and `Settings` only when `canManageRepo === true`). Move repository title breadcrumb cleanly above tabs.

---

### F4. User/Org Public Profile (`/{owner}`) Hierarchy & Metadata Leak (Screenshots 2 & 7 vs Screenshots 3, 4, 6)

- **Symptom:** Look at Screenshot 2 vs GitHub (Screenshot 3), Gitea (Screenshot 4), Forgejo (Screenshot 6):
  1. `.vibtools` `profile/README.md` card (`OwnerPage.tsx:154-205`) renders **ABOVE** `OwnerReposIsland` (`Overview | Repositories` tabs), so switching to `Repositories` tab STILL shows `.vibtools` README on top.
  2. Anonymous visitors see `MEMBER` role badge (`OwnerPage.tsx:81-85`) and a public `.vibtools` repo shortcut link (`OwnerPage.tsx:121-125`) inside the profile header.
  3. Clicking `Overview` shows BOTH `Pinned` AND the full `Repositories` directory stacked (`src/client/islands/owner-profile.tsx:314-433`), making Overview overly tall and redundant with the `Repositories` tab.
- **Code Proof (`src/client/pages/OwnerPage.tsx:81-85, 121-125, 154-240`):**
  ```tsx
  <span className="rounded border ... uppercase">
    {ownerRole}
  </span>
  ...
  {hasProfileRepo ? (
    <a href={`/${owner}/${profileRepoSlug}`}>.{profileRepoSlug.slice(1)}</a>
  ) : null}
  ...
  {/* Profile README currently rendered BEFORE OwnerReposIsland! */}
  {profileReadme ? <section aria-label="Profile README">...</section> : null}
  <IslandHost name="owner-profile" ...>
  ```
- **Target Fix:**
  - Move `profileReadme` + owner `.vibtools` setup banner **inside** `OwnerReposIsland`'s `"overview"` tab panel (below pinned/popular repos or right at top of the Overview tab, disappearing cleanly when user switches to `"repositories"` tab, matching GitHub & Gitea!).
  - Hide `ownerRole` badge from anonymous public visitors (show only when `viewer` is admin/owner viewing, or keep public header clean like GitHub/Gitea/Forgejo: Display Name, `@handle`, concise bio, repo count, location, website).
  - Keep `Pinned` + compact repository cards inside `Overview` tab and put search/filter/all-repos cleanly inside `Repositories` tab.

---

### F5. Users Panel (`/user/*`) Clutter & Admin CTA Leak (`AccountPage.tsx`, `UserSettingsLayout.tsx`)

- **Symptom:** The user specifically flagged _"users panel er moddhe admin CTA and useless CTA nav button ekhono ace"_.
- **Code Proof 1 — Admin CTA Leaked Into User Panel (`src/client/pages/AccountPage.tsx:136-144`):**
  ```tsx
  {
    isAdmin ? (
      <a
        href="/admin"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-500/30 bg-accent-500/10 ..."
      >
        <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Site Administration</span>
      </a>
    ) : null;
  }
  ```
  _`Control Panel` is already in the top-right `@username` header dropdown (`header.tsx:96-102`). Mixing an Admin button inside `/user/*` violates panel separation._
- **Code Proof 2 — Duplicate Profile Link (`AccountPage.tsx:127-135` + `profile-settings.tsx:89-95`):**
  - `AccountPage` header renders `Public page ↗` at top right, and right underneath it `ProfileSettingsIsland` ALSO renders `Open /{namespaceSlug} ↗` on `/user/profile`!
- **Code Proof 3 — Extra Footer CTA in User Sidebar (`src/client/components/UserSettingsLayout.tsx:114-123`):**
  ```tsx
  <a href="/">
    <FolderGit2 ... />
    <span>Back to Repositories</span>
  </a>
  ```
  _Duplicates the primary `Repositories` link sitting directly in the top header (`header.tsx:41`)._
- **Target Fix:**
  - Remove `Site Administration` button from `AccountPage.tsx` completely (keep `/admin` accessible strictly from the header `@user` menu and `/admin/*`).
  - Keep a single concise `View public profile ↗` action in `AccountPage` header (remove redundant duplicate in `profile-settings.tsx` header or vice versa).
  - Remove redundant `Back to Repositories` footer CTA from `UserSettingsLayout.tsx` (keep sidebar laser-focused on User Settings sections: `Profile`, `Account & Repos`, `Settings`, `Security`, `Access Tokens`). Simplify `/user/settings` vs `/user/profile` overlap so each link has a clear single purpose.

---

### F6. Global Header & Auth Sign-In Polish (`header.tsx`, `AuthSignInPage.tsx`)

- **Code Proof (`src/client/components/header.tsx:19, 34-61, 108-115`):**
  - Top bar `bg-white dark:bg-zinc-900` needs crisp surface contrast (`dark:bg-[#010409] dark:border-b dark:border-[#30363d]`) and cleaner spacing (`h-13` / `52px`), zero bloated `rounded-xl` buttons.
  - Note: Test `test/github-feel.worker.test.ts` and `test/admin-panel.test.ts` assert header links and routes — keep exact `href` paths (`/`, `/explore`, `/auth`, `/user/profile`, `/admin`) untouched!

---

## 2. Strict Per-Phase Scope Locks

> **Contract:** During any Phase `N`, ONLY files listed under **Allowed Files** may be modified. Everything under **Locked / Untouched** MUST NOT be touched or refactored during that phase.

| Phase        | Scope Focus                                                                                                   | Allowed Files to Modify                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Strictly Locked / Untouched                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase-01** | Design System, Fonts, Cool-Slate Palette & Standardized Radius                                                | `src/client/server/document.tsx`, `src/client/styles/app.css`, `src/client/components/ui/button.tsx`, `src/client/components/ui/card.tsx`, `src/client/components/ui/input.tsx`, `src/client/components/ui/badge.tsx`, `src/client/components/ui/page-header.tsx`                                                                                                                                                                                                                                                               | All worker routes (`src/worker/*`), all islands logic, DB/DAL, DO, tests (except visual/CSS class assertions if any)                     |
| **Phase-02** | Top Header + Full-Width Repo Sub-Nav (`RepoNav`) + `Admin` Tab RBAC Gate                                      | `src/client/components/header.tsx`, `src/client/components/RepoNav.tsx`, `src/client/pages/OverviewPage.tsx`, `src/client/pages/TreePage.tsx`, `src/client/pages/BlobPage.tsx`, `src/client/pages/CommitsPage.tsx`, `src/client/pages/CommitPage.tsx`, `src/client/pages/AdminPage.tsx`, `src/worker/routes/ui/helpers.ts`, `src/worker/routes/ui/overview.ts`, `src/worker/routes/ui/tree.ts`, `src/worker/routes/ui/blob.ts`, `src/worker/routes/ui/commits.ts`, `src/worker/routes/ui/adminPage.ts`, + test update if needed | `src/worker/git/*`, `src/worker/do/*`, `src/worker/db/*`, `src/worker/auth/*`, `OwnerPage.tsx`, `AccountPage.tsx`, `SystemAdminPage.tsx` |
| **Phase-03** | Public Profile (`/{owner}`) GitHub/Gitea Layout & Privacy Cleanups                                            | `src/client/pages/OwnerPage.tsx`, `src/client/islands/owner-profile.tsx`, `src/worker/routes/ui/overview.ts` (profile handler section only), `test/vibtools-profile.worker.test.ts`, `test/github-feel.worker.test.ts`                                                                                                                                                                                                                                                                                                          | Repo browse pages, `/user/*`, `/admin/*`, Git Smart HTTP, Auth APIs                                                                      |
| **Phase-04** | Users Panel (`/user/*`) & Sidebar Cleanup (Remove Admin & Duplicate CTAs)                                     | `src/client/pages/AccountPage.tsx`, `src/client/components/UserSettingsLayout.tsx`, `src/client/islands/profile-settings.tsx`, `src/client/islands/tokens.tsx`, `src/client/islands/change-password.tsx`, `src/client/islands/repositories.tsx`, `test/admin-panel.test.ts`, `test/demo-user-mock-repo.worker.test.ts`                                                                                                                                                                                                          | `/admin/*` pages & APIs, Git routes, `OwnerPage.tsx`, Repo pages                                                                         |
| **Phase-05** | Error Handling Hardening + Remaining Views Polish (`Tree`, `Blob`, `Commits`, `Home`, `AuthSignIn`, `Admin*`) | `src/client/server/error.ts`, `src/worker/index.ts` (content-negotiated `onError`), `src/client/pages/ErrorPage.tsx`, `src/client/pages/NotFoundPage.tsx`, `src/client/pages/HomePage.tsx`, `src/client/pages/AuthSignInPage.tsx`, `src/client/components/AdminSettingsLayout.tsx`, `src/client/pages/AdminSettingsPage.tsx`, `src/client/pages/AdminSecurityPage.tsx` + targeted error-boundary tests                                                                                                                          | `src/worker/git/*`, `src/worker/do/*`, `src/worker/db/*`, Git ACL status codes (401/403/404 contracts in `git-acl.worker.test.ts`)       |
| **Phase-06** | End-to-End Responsive, Dark/Light & Production Audit                                                          | Cross-view verification, test additions under `test/`, Prettier formatting (`npm run format:check`), Playwright captures (desktop + mobile, dark + light)                                                                                                                                                                                                                                                                                                                                                                       | No new features outside Phases 01–05; fix only regressions discovered in verification                                                    |
