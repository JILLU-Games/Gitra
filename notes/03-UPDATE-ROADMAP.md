# 03 — A–Z Step-by-Step Public Homepage Upgrade Roadmap (`002`)

> **Document Purpose:** Phased execution roadmap for transforming the Public Homepage (`GET /` and `GET /explore`) into a **Personalized Company / Organization Open-Source & Team Repository Portal** for **Vib Tools** (`https://vibtools.io/`).
> **Total Phases:** `4` strictly scope-locked phases (`Phase-01` → `Phase-04`).
> **Execution Rule:** Each phase starts **only** after the user pastes the explicit phase approval command prompt.

---

## Roadmap Overview Table

| Phase        | Phase Title                                                                                                                        | Audit IDs Covered         | Strict Scope Lock (Allowed Files Only)                                                                                                                     | Status        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Phase-01** | Backend Data Enrichment (`pinned` Metadata & Public Team/Namespace Directory Summaries for `/` and `/explore`)                     | `HP-01`                   | `src/worker/db/d1/dal/workspaceMeta.ts`<br>`src/worker/index.ts`<br>`src/client/pages/HomePage.tsx` (types)<br>`src/client/islands/home-repos.tsx` (types) | **COMPLETED** |
| **Phase-02** | Personalized Company Identity Hero & Live Open-Source Metrics Header (`HomePage.tsx`)                                              | `HP-02`                   | `src/client/pages/HomePage.tsx`                                                                                                                            | **COMPLETED** |
| **Phase-03** | Featured/Pinned Flagship Projects Grid, Team Filter Pills, Smart `.vibtools` Hiding & Sort Controls (`home-repos.tsx`)             | `HP-03`, `HP-04`, `HP-05` | `src/client/islands/home-repos.tsx`                                                                                                                        | **COMPLETED** |
| **Phase-04** | Public 2-Column Company Portal Layout (Organization Overview, Teams Directory & Private Backup Notice Sidebar) + Full Verification | `HP-06`                   | `src/client/islands/home-repos.tsx`<br>`test/github-feel.worker.test.ts`                                                                                   | **COMPLETED** |

---

## Detailed Phase-by-Phase Execution Plan

---

### Phase-01: Backend Data Enrichment (`pinned` & `publicNamespaces` for `/` and `/explore`)

1. **Goal:** Ensure `GET /` (both anonymous and signed-in) and `GET /explore` pass complete repository metadata (`pinned: boolean`) and a rich list of active public teams/namespaces (`publicNamespaces`) to `HomePage` and `HomeReposIsland`.
2. **Exact Changes:**
   - **`src/worker/db/d1/dal/workspaceMeta.ts`:**
     - Add `PublicNamespaceSummary` type (`slug`, `displayName`, `bio`, `website`, `publicRepoCount`, `projectRepoCount`).
     - Add `listPublicNamespaceSummaries(d1, publicRows, primaryAdminSlug)` which batches D1 lookups against `namespace_directory_meta` and `namespace_profile_meta` for all distinct namespaces that own at least one public repository.
   - **`src/worker/index.ts:61-169`:**
     - Include `pinned: publicMeta.get(row.repository.id)?.pinned ?? false` (and `repoMeta.get(row.repository.id)?.pinned ?? false`) on every mapped repository item in `GET /` and `GET /explore`.
     - Pass `publicNamespaces` into `renderUiDocumentResponse(c.env, "home" | "explore", ...)`.
   - **`src/client/pages/HomePage.tsx` & `src/client/islands/home-repos.tsx`:**
     - Add `pinned?: boolean` to `HomeRepositoryItem` and `publicNamespaces?: PublicNamespaceSummary[]` to `HomePageProps` and `HomeReposIslandProps`.
3. **Verification Gates:**
   - `npm run typecheck`
   - `npm run test`
   - `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts`
   - `compile_applet` + `lint_applet`

---

### Phase-02: Personalized Company Identity Hero & Live Open-Source Metrics Header (`HomePage.tsx`)

1. **Goal:** Replace the generic `"git-on-cloudflare"` boilerplate box on the public homepage (`src/client/pages/HomePage.tsx:33-59`) with a high-trust, personalized **Vib Tools — Official Open-Source & Engineering Forge** company header.
2. **Exact Changes (`src/client/pages/HomePage.tsx`):**
   - Render company identity badge (`Vib Tools · Official Open-Source & Engineering Forge`).
   - Keep `git-on-cloudflare` in the primary heading along with the **Vib Tools Open-Source & Team Repositories** subtitle so both human visitors and existing automated tests recognize the instance identity immediately.
   - Add clear company copy explaining that public repositories are **Free & Open-Source software** grouped by **Company Teams / Namespaces**, while **Private Company Backups** are accessible to authenticated team members.
   - Add action links (`https://vibtools.io/` official website button + `Team Sign in` `/auth` button).
   - Add a live bottom metrics strip inside the hero card showing:
     - Open-Source Projects count (excluding `.vibtools` profile config repos)
     - Active Teams / Namespaces count
     - Featured / Pinned Releases count (or `Git Smart HTTP v2 · Edge-Native`)
     - Private Company Backups status indicator (`Protected · Team Auth`)
3. **Verification Gates:**
   - `npm run typecheck`
   - `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts`
   - `compile_applet` + `lint_applet`

---

### Phase-03: Featured/Pinned Flagship Projects Grid, Team Filter Pills, Smart `.vibtools` Hiding & Sort Controls (`home-repos.tsx`)

1. **Goal:** Make the public repository catalog inside `src/client/islands/home-repos.tsx` behave like a modern company open-source portal where flagship projects stand out, teams/namespaces are one-click filterable, and internal `.vibtools` profile config repos do not clutter the main project list.
2. **Exact Changes (`src/client/islands/home-repos.tsx`):**
   - **Featured / Pinned Open-Source Projects Grid:** Display a 2-column showcase grid at the top of the public feed for pinned public repositories (or top non-profile public repositories), with description, `@namespace` team link, `Public` badge, relative update time, and one-click `Clone` URL copy.
   - **Smart `.vibtools` Dotfile Repo Hiding:** Hide `.vibtools` profile metadata repositories by default in the public catalog (`activeFeed === "public"`) unless the user toggles `Profile configs (.vibtools)` or searches for `.vibtools` (with an automatic fallback if only `.vibtools` repos exist).
   - **Interactive Team / Namespace Filter Strip:** Add horizontal filter pills (`All Teams`, `@alex-dev`, `@admin`, etc.) with project counts so visitors can filter open-source repositories by company team/division in one click.
   - **Sort Selector & Typography Polish:** Add a sort switcher (`Recently updated` vs `Name A–Z`), upgrade repo row headings from `font-mono` to `Hanken Grotesk` (`text-sm font-semibold tracking-tight`), and replace all remaining `rounded-lg` classes with `rounded-md`.
3. **Verification Gates:**
   - `npm run typecheck`
   - `npm run test`
   - `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts`
   - `compile_applet` + `lint_applet`

---

### Phase-04: Public 2-Column Company Portal Sidebar (Organization Overview, Teams Directory & Private Backup Notice) + Full Regression Sign-Off

1. **Goal:** Complete the public homepage (`/` and `/explore`) with a right-hand **Organization & Teams Sidebar** (`280px` on desktop) and perform the full Playwright desktop/mobile dark/light visual & regression sign-off.
2. **Exact Changes (`src/client/islands/home-repos.tsx` & `test/github-feel.worker.test.ts`):**
   - Replace the single-column anonymous return (`lines 525-527`) with a responsive 2-column layout (`grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]`).
   - Add the 3-card public right sidebar:
     1. **Organization Overview Card:** Vib Tools summary, `https://vibtools.io/`, and `support@vibtools.io`.
     2. **Teams & Namespaces Directory Card:** Interactive list of active company teams/namespaces (`@alex-dev`, `@admin`) showing display name, bio snippet, public project count, direct profile link (`/:owner`), and one-click catalog filter.
     3. **Private & Backup Repositories Card (anonymous view):** Explains that internal company backups and private product builds require team authentication (`Sign in to Team Workspace →` `/auth`).
   - Add automated integration assertions in `test/github-feel.worker.test.ts` verifying the company hero, featured projects, team namespace directory, `.vibtools` clean catalog filtering, and private backup notice on `GET /` and `GET /explore`.
3. **Final Verification Gates:**
   - `npm run format:check`
   - `npm run typecheck`
   - `npm run test` (`53/53` unit tests)
   - `npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts test/demo-user-mock-repo.worker.test.ts test/vibtools-profile.worker.test.ts`
   - Desktop (`1440x900`) & Mobile (`390x844`) Dark + Light Playwright visual audit of `/` and `/explore`
   - `compile_applet` + `lint_applet`
