# 01 — Baseline Freeze & Snapshot (`v0.2.0` — Pre-Homepage Portal Upgrade)

> **Freeze Timestamp:** `2026-11-23`
> **Workspace Root:** `/app/applet`
> **Baseline Milestone:** Post-Wave-1 Production Sign-Off + Vib Tools (`https://vibtools.io/`) Brand Migration Complete.
> **Active Scope:** Public Homepage (`GET /` and `GET /explore`) Transformation into a **Personalized Company / Organization Open-Source & Team Repository Portal**.

---

## 1. Frozen Baseline Verification Status (`2026-11-23`)

Before planning the Public Homepage upgrade, the entire repository was verified and frozen at the following clean state:

| Verification Gate                   | Frozen Baseline Result               | Citation / Command                                                                                                                             |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript & Wrangler Types         | **PASS (`0` errors)**                | `npm run typecheck`                                                                                                                            |
| Prettier Code Formatting            | **PASS (`100%` clean)**              | `npm run format:check`                                                                                                                         |
| Node Unit Test Suite                | **PASS (`13` suites / `53` tests)**  | `npm run test`                                                                                                                                 |
| Cloudflare Worker Integration Suite | **PASS (`16` suites / `65` tests)**  | `npx vitest run --config vitest.config.ts ...`                                                                                                 |
| Production Applet Build             | **PASS**                             | `compile_applet`                                                                                                                               |
| Legacy `limic.dev` Brand Scan       | **PASS (`0` occurrences remaining)** | Replaced project-wide with `https://vibtools.io/` & **Vib Tools**                                                                              |
| Design System Tokens                | **LOCKED (`Phase-01` Wave 1)**       | `Hanken Grotesk` + `JetBrains Mono`, cool-slate `#0d1117`/`#161b22`/`#010409`/`#30363d`, Forge Blue `#1f6feb`/`#58a6ff`, `rounded-md` geometry |

---

## 2. Exact Baseline Snapshot of the Public Homepage Subsystem

The Public Homepage subsystem is strictly owned by **3 source files** plus **1 D1 metadata DAL module**:

### 2.1 Worker Route Handlers (`src/worker/index.ts:61-170`)

- **`GET /` (`src/worker/index.ts:61-134`):**
  - Calls `ensureDemoWorkspaceOnPublicEntry(c)` (`line 62`), `loadViewer(c)` (`line 63`), and `listPublicRepositoriesWithNamespaces(c.var.db)` (`line 65`).
  - When `!viewer` (`lines 67-90`), loads `publicMeta = await listRepositoryMetaMap(c.env.DB, publicRows.map((row) => row.repository.id))` (`lines 68-71`) and maps `publicRepositories` (`lines 72-79`).
  - **Frozen Baseline Gap in `src/worker/index.ts:72-79, 103-110, 145-152`:**
    1. Does **not** include `pinned: publicMeta.get(row.repository.id)?.pinned ?? false` in `publicRepositories` or `repositories` items, even though `listRepositoryMetaMap()` already fetches `pinned` from SQLite (`src/worker/db/d1/dal/workspaceMeta.ts:158-168`).
    2. Does **not** pass `publicNamespaces` (team/namespace slug, `displayName`, `bio`, and `publicRepoCount`) to `HomePage`, leaving the public homepage unable to display a Company Teams / Namespaces directory or filter strip with rich team metadata.

### 2.2 Public Homepage SSR Component (`src/client/pages/HomePage.tsx:1-104`)

- **Lines `33-59` (`!signedIn` Header Banner):**
  - Currently renders a generic small box with `<GitBranch />`, `<h1>git-on-cloudflare</h1>`, and text: _"Edge-native Git Smart HTTP v2 hosting on Cloudflare Workers. Explore public repositories below or sign in to create repositories and manage tokens."_
  - **Frozen Baseline Gap:** Lacks **Vib Tools** organization branding, company mission statement (_"Practical software for real workflows"_), official link (`https://vibtools.io/`), live open-source project/team counters, and distinction between Public Open-Source repositories and Private Company Backups.

### 2.3 Public & Workspace Repositories Island (`src/client/islands/home-repos.tsx:1-621`)

- **`HomeRepositoryItem` (`lines 31-38`):**
  - Fields: `id`, `slug`, `namespaceSlug`, `visibility`, `description`, `updatedAt`. Missing `pinned?: boolean`.
- **Filtering Logic (`lines 96-114`):**
  - Filters only by `visibilityFilter` (when `signedIn && activeFeed === "mine"`) and text search `query`.
  - **Frozen Baseline Gaps:**
    1. **No `.vibtools` Dotfile Repo Filtering:** Internal profile metadata repositories (`admin/.vibtools`, `alex-dev/.vibtools`) appear directly inside the main public software catalog alongside real open-source projects (`cloud-forge-kit`, `edge-kit`, `edge-starter`).
    2. **No Featured / Pinned Open-Source Showcase Grid:** Pinned flagship repositories are not highlighted in a 2-column showcase grid at the top of the public homepage.
    3. **No Team / Namespace Filter Pills (`@alex-dev`, `@admin`):** Visitors cannot filter public repositories by company team, division, or developer namespace.
    4. **No Sort Control:** Visitors cannot switch between `Recently updated` and `Name (A–Z)`.
    5. **Single-Column Anonymous Layout (`lines 525-527`):** `if (!signedIn || exploreOnly) { return repoListPanel; }` hides the right-hand sidebar completely on the public homepage instead of presenting an **Organization Overview, Teams & Namespaces Directory, and Private Backup Workspace Sign-In Card**.
    6. **Typography & Border Radius Drift (`lines 297, 404, 422, 433, 535, 596`):** Uses `rounded-lg` on containers instead of `rounded-md` and renders the entire `namespace / repo` title in `font-mono` (`line 433`) instead of crisp `Hanken Grotesk` sans-serif (`font-semibold`).

---

## 3. Subsystems Explicitly Frozen & Untouched During This Wave

To guarantee zero regressions, all subsystems outside the Public Homepage remain **100% locked and untouched**:

- Git Smart HTTP v2 protocol routes (`src/worker/routes/git.ts`, `RepoDurableObject`, pack assembly/indexing, R2 storage)
- Public Owner Profile page (`src/client/pages/OwnerPage.tsx`, `src/client/islands/owner-repositories.tsx`)
- Repository Code / Tree / Blob / Commits / Diff / Admin pages (`OverviewPage.tsx`, `TreePage.tsx`, `BlobPage.tsx`, `CommitsPage.tsx`, `CommitPage.tsx`, `AdminPage.tsx`, `RepoNav.tsx`)
- User Settings & Access Tokens panel (`AccountPage.tsx`, `UserSettingsLayout.tsx`, `src/worker/routes/authTokens.ts`)
- Site Administration panel (`SystemAdminPage.tsx`, `AdminSettingsLayout.tsx`, `src/worker/routes/systemAdmin.ts`)
- Global Error Boundaries (`src/client/server/error.ts`, `src/client/pages/ErrorPage.tsx`, `src/client/pages/NotFoundPage.tsx`)
