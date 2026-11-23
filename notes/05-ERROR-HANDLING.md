# 05 — Error Handling Inventory & Public Homepage Safeguards (`004`)

> **Document Purpose:** Comprehensive inventory of all active error handling mechanisms across the application (`G1–G7` hardened in Wave 1), plus specific error handling and edge-case fallback rules required for the **Public Homepage (`GET /` & `GET /explore`) Upgrade**.

---

## 1. Active Application-Wide Error Handling Inventory (Hardened & Verified)

| ID     | Subsystem / File                                                                                        | Active Error Handling Behavior                                                                                                                                                                                                                                                                              | Verification Status                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | Top-Level Worker Error Handler (`src/worker/index.ts:185-217`)                                          | Inspects request `Accept` header and route prefix. Returns structured JSON `{ error, status }` for `/api/*`, `/auth/api/*`, `/admin/api/*`, and Git protocol routes, and renders a themed SSR HTML `ErrorPage` (with escaped fallback via `buildEscapedErrorHtmlDocument`) for browser navigation requests. | **ACTIVE & TESTED**                                                                                                                                           |
| **G2** | SSR Render Fallback (`src/worker/routes/uiResponse.ts` & `src/client/server/error.ts`)                  | Wraps React SSR document rendering in a try/catch that logs structured `ui:render-failed` diagnostics and serves a clean, HTML-escaped dark-slate error document (`buildEscapedErrorHtmlDocument`) if SSR ever fails.                                                                                       | **ACTIVE & TESTED**                                                                                                                                           |
| **G3** | Repository Overview & Tree Read Path (`src/worker/routes/ui/overview.ts:232-243`, `tree.ts`)            | Gracefully catches DO ref/tree lookup failures (`repoLog.warn(...)`) and renders an empty-repository / branch state instead of crashing with an unhandled 500.                                                                                                                                              | **ACTIVE & TESTED**                                                                                                                                           |
| **G4** | Client Island Hydration Registry (`src/client/hydrate.tsx`)                                             | Validates island mount nodes and props JSON parsing inside try/catch blocks so a malformed or missing DOM island never crashes the rest of the page.                                                                                                                                                        | **ACTIVE & TESTED**                                                                                                                                           |
| **G5** | Repository Creation & File Commit Forms (`src/client/islands/home-repos.tsx:130-187`, `repo-admin.tsx`) | Maps backend tagged union error reasons (`slug-taken`, `invalid-slug`, `viewer-read-only`, `not-member`, `invalid-visibility`) to human-friendly inline error banners (`createError`) with zero `window.alert`.                                                                                             | **ACTIVE & TESTED**                                                                                                                                           |
| **G6** | Auth & Session Boundary (`src/worker/routes/authLogin.ts:54-60, 174-207`)                               | Redirects invalid login attempts or expired sessions cleanly via `303 See Other` to `/auth?error=<code>` and sanitizes `next` redirect targets via `sanitizeNextRedirect` to prevent open-redirect vulnerabilities.                                                                                         | **ACTIVE & TESTED**                                                                                                                                           |
| **G7** | Durable Object Receive & Compaction Leases (`src/worker/do/repo/repoDO.ts`)                             | Uses tagged unions (`{ ok: true, ... }                                                                                                                                                                                                                                                                      | { ok: false, reason: ... }`) across Worker-to-DO RPC calls and returns `503 Service Unavailable`with`Retry-After: 10` on concurrent receive lease contention. | **ACTIVE & TESTED** |

---

## 2. Public Homepage (`GET /` & `GET /explore`) Error Handling & Edge-Case Safeguards

During `Phase-01` → `Phase-04` of the Public Homepage upgrade, the following 5 error-handling and resilience rules MUST be enforced:

### EH-HP-01: D1 Auxiliary Metadata Table Resilience (`src/worker/db/d1/dal/workspaceMeta.ts`)

- **Risk:** On a brand-new or freshly reset D1 database where no profile or directory edits have occurred yet, `namespace_directory_meta` or `namespace_profile_meta` might not have rows for every namespace.
- **Safeguard:** `listPublicNamespaceSummaries()` MUST call `ensureWorkspaceMetaTables(d1)` and `ensureNamespaceDirectoryMetaTable(d1)` first, chunk `IN (...)` queries safely (`chunkSize = 80` under SQLite variable limits), and fall back cleanly to `sanitizeDisplayName("", slug)` (or `"Administrator"` for the primary admin namespace) and `bio: ""` whenever a namespace has no metadata row.

### EH-HP-02: Smart `.vibtools` Filtering Empty-Catalog Fallback (`src/client/islands/home-repos.tsx`)

- **Risk:** If a freshly initialized organization instance currently has _only_ `.vibtools` public repositories and zero normal project repositories, hiding `.vibtools` unconditionally would make the public homepage appear empty (`0` repositories) even though public repositories exist.
- **Safeguard:** Compute `hasNonProfilePublicRepos = publicRepositories.some((r) => r.slug !== PROFILE_REPO_SLUG)`. Only hide `.vibtools` by default when `hasNonProfilePublicRepos === true`. If all public repos are `.vibtools`, display them automatically so the catalog is never falsely blank.

### EH-HP-03: Filter & Search Zero-Match Recovery UX (`src/client/islands/home-repos.tsx`)

- **Risk:** When a visitor filters by a specific team (`@admin`), toggles a search query, or filters out `.vibtools`, they may hit a `"No matching repositories"` empty state without an obvious one-click reset.
- **Safeguard:** Whenever `filtered.length === 0` while `sourceList.length > 0`, display an inline **`Reset filters`** button inside the empty state card that clears `query`, resets `namespaceFilter` to `"all"`, and restores the catalog immediately.

### EH-HP-04: Restricted Iframe Clipboard API Fallback (`src/client/islands/home-repos.tsx:116-128`)

- **Risk:** Both the new **Featured Open-Source Projects** cards and the main **Repository Directory** rows have a one-click `Clone` (`Copy HTTPS clone URL`) button. In restricted browser or iframe contexts, `navigator.clipboard.writeText()` can reject.
- **Safeguard:** Keep `handleCopyClone(repo)` wrapped in `try / catch` so clipboard permission errors never throw an unhandled promise rejection, and ensure `copiedId` timeout cleanup is safe across rapid clicks.

### EH-HP-05: Demo Seeding Fault Isolation on Public Entry (`src/worker/index.ts:48-59`)

- **Risk:** `ensureDemoWorkspaceOnPublicEntry(c)` runs on `GET /` and `GET /explore` in demo mode.
- **Safeguard:** Keep `ensureDemoWorkspaceOnPublicEntry(c)` idempotent and fast-exiting (`if (existing) return;`) so public homepage requests remain fast and resilient across concurrent requests.
