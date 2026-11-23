# 02 — Forensic Audit, Code Patch Proofs & Phase Scope Locks (`001`)

> **Document Purpose:** Exact forensic audit of the Public Homepage (`GET /` and `GET /explore`) against the Company / Organization Open-Source & Team Repository Portal requirements, complete with exact file paths, line numbers, before/after code block proofs, and strict **Phase-01 → Phase-04 Scope Locks**.

---

## 1. Executive Summary of Public Homepage Forensic Findings

| Audit ID  | File & Exact Line Range                                                 | Problem Identified in Frozen Baseline                                                                                                                                                                                                                                                                                             | Target Fix & Phase                                                                                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HP-01** | `src/worker/index.ts:67-168`<br>`src/worker/db/d1/dal/workspaceMeta.ts` | `GET /` and `GET /explore` already call `listRepositoryMetaMap()`, which loads `pinned: boolean` from SQLite, but `index.ts` discards `pinned` when mapping `publicRepositories` and `repositories`. In addition, no public team/namespace metadata (`displayName`, `bio`, `publicRepoCount`) is queried or passed to `HomePage`. | **Phase-01:** Add `listPublicNamespaceSummaries()` in `workspaceMeta.ts`, include `pinned` on every mapped repo in `src/worker/index.ts`, and pass `publicNamespaces` to `HomePage` & `HomeReposIsland`.                                                                            |
| **HP-02** | `src/client/pages/HomePage.tsx:33-59`                                   | Public visitors (`!signedIn`) see a generic `"git-on-cloudflare"` technical demo banner with no **Vib Tools** company branding, no explanation of public open-source vs private company backups, no link to `https://vibtools.io/`, and no live open-source project/team metrics.                                                 | **Phase-02:** Replace the generic banner in `HomePage.tsx` with the **Vib Tools — Open-Source & Engineering Forge** company hero card, live metrics strip (`Open-Source Projects`, `Active Teams / Namespaces`, `Git Smart HTTP v2`), `vibtools.io ↗` link, and `Team Sign in` CTA. |
| **HP-03** | `src/client/islands/home-repos.tsx:96-114`                              | Internal `.vibtools` profile metadata repositories (`admin/.vibtools`, `alex-dev/.vibtools`) clutter the main public catalog alongside actual software projects (`cloud-forge-kit`, `edge-kit`, `edge-starter`).                                                                                                                  | **Phase-03:** Hide `.vibtools` dotfile repos by default in the main public repository feed (`activeFeed === "public"`), and provide an explicit `Show profile repos (.vibtools)` toggle pill in the filter strip.                                                                   |
| **HP-04** | `src/client/islands/home-repos.tsx:189-292`                             | No **Featured / Pinned Open-Source Projects** showcase grid at the top of the public homepage, no **Team / Namespace filter pills** (`All Teams`, `@alex-dev`, `@admin`), and no **Sort selector** (`Recently updated` vs `Name A–Z`).                                                                                            | **Phase-03:** Render a 2-column **Featured Open-Source Projects** showcase grid for pinned public repos, interactive **Team / Namespace Filter Pills**, and a **Sort Switcher** (`updated` / `name`).                                                                               |
| **HP-05** | `src/client/islands/home-repos.tsx:297,404,422,433,535,596`             | Repository list rows use `font-mono` for the entire `namespace / repo` heading (`line 433`) and legacy `rounded-lg` borders (`lines 297, 404, 422, 535, 596`) instead of the `Phase-01` `Hanken Grotesk` sans-serif + `rounded-md` design standard.                                                                               | **Phase-03:** Upgrade repo title typography to crisp sans-serif (`font-semibold`) with team badge & `Pinned` badge, and normalize all cards/containers in `home-repos.tsx` to `rounded-md`.                                                                                         |
| **HP-06** | `src/client/islands/home-repos.tsx:524-527`                             | When `!signedIn                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                     | exploreOnly`, `HomeReposIsland` returns a single full-width column (`return repoListPanel;`) with zero organization sidebar—missing the **Organization Overview**, **Teams & Namespaces Directory**, and **Private & Backup Repositories Workspace Notice**. | **Phase-04:** Render a responsive 2-column layout (`lg:grid-cols-[minmax(0,1fr)_280px]`) on the public homepage with a dedicated **Organization & Teams Sidebar** on the right. |

---

## 2. Detailed Forensic Proofs & Exact Code Patches Per Phase

---

### PHASE-01: Backend Data Enrichment (`GET /` & `GET /explore` — Pinned Metadata & Public Team Summaries)

#### Scope Lock for Phase-01

- **Allowed Files (4):**
  1. `src/worker/db/d1/dal/workspaceMeta.ts`
  2. `src/worker/index.ts`
  3. `src/client/pages/HomePage.tsx` (prop types & passthrough only)
  4. `src/client/islands/home-repos.tsx` (prop types only)
- **Strictly Forbidden in Phase-01:** Do not change visual markup in `HomePage.tsx` or `home-repos.tsx` yet; do not touch any other route or component.

#### Forensic Proof (`src/worker/index.ts:67-89`) — Before

```ts
if (!viewer) {
  const publicMeta = await listRepositoryMetaMap(
    c.env.DB,
    publicRows.map((row) => row.repository.id)
  );
  const publicRepositories = publicRows.map((row) => ({
    id: row.repository.id,
    slug: row.repository.slug,
    namespaceSlug: row.namespace.slug,
    visibility: row.repository.visibility,
    description: publicMeta.get(row.repository.id)?.description ?? "",
    updatedAt: row.repository.updatedAt,
  }));
  return renderUiDocumentResponse(
    c.env,
    "home",
    {
      signedIn: false,
      origin,
      publicRepositories,
    },
    { failureBody: "Failed to render page\n", viewer: null }
  );
}
```

#### Exact Target Patch Proof for Phase-01

1. **`src/worker/db/d1/dal/workspaceMeta.ts` — Add `PublicNamespaceSummary` & `listPublicNamespaceSummaries()`:**

```ts
export type PublicNamespaceSummary = {
  slug: string;
  displayName: string;
  bio: string;
  website: string;
  publicRepoCount: number;
  projectRepoCount: number;
};
```

Queries `namespace_directory_meta` (`display_name`) and `namespace_profile_meta` (`bio`, `website`) in one batched D1 lookup for the distinct namespace IDs present in `publicRows`, computing `publicRepoCount` (all public repos in that namespace) and `projectRepoCount` (public repos excluding `.vibtools`).

2. **`src/worker/index.ts:61-169` — Include `pinned` and `publicNamespaces` on `GET /` and `GET /explore`:**

```ts
const [publicMeta, publicNamespaces] = await Promise.all([
  listRepositoryMetaMap(
    c.env.DB,
    publicRows.map((row) => row.repository.id)
  ),
  listPublicNamespaceSummaries(c.env.DB, publicRows, resolveAdminAuthConfig(c.env).username),
]);
const publicRepositories = publicRows.map((row) => ({
  id: row.repository.id,
  slug: row.repository.slug,
  namespaceSlug: row.namespace.slug,
  visibility: row.repository.visibility,
  description: publicMeta.get(row.repository.id)?.description ?? "",
  pinned: publicMeta.get(row.repository.id)?.pinned ?? false,
  updatedAt: row.repository.updatedAt,
}));
```

(And identically include `pinned: repoMeta.get(row.repository.id)?.pinned ?? false` and `publicNamespaces` in the signed-in `GET /` branch at `lines 103-131` and `GET /explore` at `lines 145-166`.)

3. **`src/client/islands/home-repos.tsx:31-50` & `src/client/pages/HomePage.tsx:7-17` — Extend Props:**

```ts
export type PublicNamespaceItem = {
  slug: string;
  displayName: string;
  bio?: string;
  website?: string;
  publicRepoCount: number;
  projectRepoCount: number;
};

export type HomeRepositoryItem = {
  id: string;
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  description?: string;
  pinned?: boolean;
  updatedAt: number;
};
```

---

### PHASE-02: Personalized Company Identity Hero & Live Open-Source Metrics Header (`HomePage.tsx`)

#### Scope Lock for Phase-02

- **Allowed Files (1):**
  1. `src/client/pages/HomePage.tsx`
- **Strictly Forbidden in Phase-02:** Do not touch `home-repos.tsx`, `index.ts`, or any other page.

#### Forensic Proof (`src/client/pages/HomePage.tsx:33-59`) — Before

```tsx
      {!signedIn ? (
        <section className="flex flex-col justify-between gap-4 rounded-md border border-zinc-200 bg-white px-5 py-4 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GitBranch
                className="h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                git-on-cloudflare
              </h1>
            </div>
            <p className="m-0 mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Edge-native Git Smart HTTP v2 hosting on Cloudflare Workers. Explore public
              repositories below or sign in to create repositories and manage tokens.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/auth"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3.5 text-xs font-medium whitespace-nowrap text-white no-underline hover:bg-accent-700"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sign in</span>
            </a>
          </div>
        </section>
      ) : (
```

#### Exact Target Patch Proof for Phase-02 (`src/client/pages/HomePage.tsx`)

Replace the generic banner with a personalized **Vib Tools Organization Open-Source & Engineering Portal Hero Card** (shown on anonymous `/` and on `/explore`):

- Computes:
  - `openSourceProjectCount`: count of `publicRepositories` where `repo.slug !== PROFILE_REPO_SLUG` (falling back to `publicRepositories.length` if all are profile repos).
  - `teamNamespaceCount`: `publicNamespaces.length` (or distinct `namespaceSlug` count from `publicRepositories`).
  - `pinnedProjectCount`: count of `publicRepositories` where `repo.pinned && repo.slug !== PROFILE_REPO_SLUG`.
- Displays:
  - Top eyebrow badge: `Vib Tools · Official Open-Source & Engineering Forge`
  - Main heading (`h1`): `git-on-cloudflare` (preserving test/brand anchor) with subtitle `Vib Tools Open-Source & Team Repositories`
  - Description: _"Practical software for real workflows. Browse our public open-source repositories, edge-native tools, and product team namespaces below—or sign in to access private company backups and internal workspaces."_
  - Action buttons on right:
    - External link `vibtools.io ↗` (`https://vibtools.io/`, `target="_blank"`, `rel="noreferrer"`)
    - Primary CTA `Team Sign in` (`/auth`) when `!signedIn`
  - Bottom live metrics bar inside the hero card:
    - `{openSourceProjectCount} Open-Source Projects`
    - `{teamNamespaceCount} Active Teams & Namespaces`
    - `{pinnedProjectCount > 0 ? `${pinnedProjectCount} Featured Releases` : "Git Smart HTTP v2 · Edge-Native"}`
    - `Private Company Backups Protected`

---

### PHASE-03: Featured/Pinned Showcase Grid, Team/Namespace Filter Pills, Smart `.vibtools` Hiding & Sort Controls (`home-repos.tsx`)

#### Scope Lock for Phase-03

- **Allowed Files (1):**
  1. `src/client/islands/home-repos.tsx`
- **Strictly Forbidden in Phase-03:** Do not touch `HomePage.tsx`, `OwnerPage.tsx`, `OverviewPage.tsx`, or backend routes.

#### Forensic Proof (`src/client/islands/home-repos.tsx:96-114`) — Before

```tsx
const sourceList = activeFeed === "public" ? publicRepositories : repositories;

const filtered = useMemo(() => {
  const q = query.trim().toLowerCase();
  return sourceList.filter((repo) => {
    if (
      activeFeed === "mine" &&
      visibilityFilter !== "all" &&
      repo.visibility !== visibilityFilter
    ) {
      return false;
    }
    if (!q) return true;
    return (
      `${repo.namespaceSlug}/${repo.slug}`.toLowerCase().includes(q) ||
      (repo.description ?? "").toLowerCase().includes(q)
    );
  });
}, [sourceList, activeFeed, query, visibilityFilter]);
```

#### Exact Target Patch Proof for Phase-03 (`src/client/islands/home-repos.tsx`)

1. **New Interactive State Hooks in `HomeReposIsland`:**
   - `const [namespaceFilter, setNamespaceFilter] = useState<string>("all");`
   - `const [sortBy, setSortBy] = useState<"updated" | "name">("updated");`
   - `const [showProfileRepos, setShowProfileRepos] = useState<boolean>(false);`
2. **Smart `.vibtools` Profile Repo Hiding on Public Feed:**
   - In `activeFeed === "public"`, repositories with `repo.slug === PROFILE_REPO_SLUG` (`.vibtools`) are hidden by default unless `showProfileRepos === true` OR the user explicitly types `.vibtools` in the search box (`q.includes(".vibtools")`).
   - If the instance ONLY has `.vibtools` repositories and zero non-profile repos, automatically show them so the list is never unexpectedly blank.
3. **Featured / Pinned Open-Source Projects 2-Column Grid (Public Feed):**
   - Extracts `featuredRepos = publicRepositories.filter((r) => r.pinned && r.slug !== PROFILE_REPO_SLUG).slice(0, 4)` (or top 2 non-profile public repos with descriptions if none are explicitly pinned yet).
   - When `activeFeed === "public"` and `!query.trim()` and `namespaceFilter === "all"` and `featuredRepos.length > 0`, renders a clean **`Featured Open-Source Projects`** section above the directory toolbar with 2-column `rounded-md` cards (`grid-cols-1 md:grid-cols-2`), displaying:
     - Folder/Repo icon + `namespaceSlug / slug` in `Hanken Grotesk` (`font-semibold`)
     - `Featured` / `Public` badge
     - 2-line project description
     - Team profile link (`@namespaceSlug`) + relative update timestamp + one-click `Clone` URL copy button.
4. **Team / Namespace Quick-Filter Strip (Public Feed):**
   - Renders horizontal filter pills for every active team/namespace in the public catalog:
     - `All Teams ({totalProjectCount})`
     - `@{ns.slug} ({count})` (e.g., `@alex-dev (2)`, `@admin (1)`)
     - Plus a right-aligned subtle toggle pill when profile repos exist: `Profile configs (.vibtools)` (`aria-pressed={showProfileRepos}`).
5. **Sort Switcher & Sharp Row Typography:**
   - Adds a compact sort selector (`Recently updated` | `Name A–Z`) next to the search bar.
   - Replaces `font-mono text-sm font-medium` on the repo row title (`line 433`) with `text-sm font-semibold tracking-tight` (`Hanken Grotesk`), adds a `Pinned` badge on pinned rows, and replaces all 5 legacy `rounded-lg` classes in `home-repos.tsx` (`lines 297, 404, 422, 535, 596`) with `rounded-md`.

---

### PHASE-04: Public 2-Column Company Portal Sidebar (Organization Overview, Teams Directory & Private Backup Access) + Regression Sign-Off

#### Scope Lock for Phase-04

- **Allowed Files (2):**
  1. `src/client/islands/home-repos.tsx`
  2. `test/github-feel.worker.test.ts`
- **Strictly Forbidden in Phase-04:** Do not touch any file outside `home-repos.tsx` and `test/github-feel.worker.test.ts`.

#### Forensic Proof (`src/client/islands/home-repos.tsx:524-527`) — Before

```tsx
// Anonymous homepage or /explore: single clean column
if (!signedIn || exploreOnly) {
  return repoListPanel;
}
```

#### Exact Target Patch Proof for Phase-04 (`src/client/islands/home-repos.tsx`)

Instead of dropping the right column on the public homepage (`!signedIn || exploreOnly`), render a responsive 2-column layout (`grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]`) with an `<aside aria-label="Organization and teams summary">` containing 3 compact, high-trust cards (`rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900`):

1. **Card 1 — Organization Overview (`Vib Tools`):**
   - Header: `Organization`
   - Body: **Vib Tools** (`Practical software, web applications, and open-source developer tools built for real workflows.`)
   - Links:
     - Official Website: `https://vibtools.io/`
     - Support: `mailto:support@vibtools.io`
2. **Card 2 — Teams & Namespaces Directory:**
   - Header: `Teams & Namespaces ({publicNamespaces.length})`
   - Lists each public team/namespace (`@alex-dev`, `@admin`, etc.) with:
     - Display Name (`Alex Rivera`, `Administrator`) + `@slug` handle badge
     - Optional 1-line bio snippet
     - Public repository count badge
     - Direct link to `buildNamespaceProfileHref(ns.slug)` (`/:owner`) AND quick-filter button to filter the catalog by that team.
3. **Card 3 — Private & Backup Repositories Notice (shown when `!signedIn`):**
   - Header with `<Lock />` icon: `Private & Backup Repositories`
   - Copy: _"Internal company backups, proprietary product builds, and private team repositories are hidden from public view."_
   - CTA link: `Sign in to Team Workspace →` (`/auth`).
