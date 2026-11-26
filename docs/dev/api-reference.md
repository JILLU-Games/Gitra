---
title: HTTP & JSON API Reference
description: Exhaustive reference of every Git Smart HTTP, Web UI, Auth, Account, Repository Admin, and Site Administration endpoint in Gitra.
order: 4
draft: false
---

# HTTP & JSON API Reference

Every route, HTTP method, authentication requirement, and Zod schema below is verified directly from `src/worker/index.ts`, `src/worker/routes/*`, and `src/worker/routes/requestSchemas.ts`.

---

## Authentication & CSRF Legend

- **Public / Optional Session:** Accessible anonymously for public resources; private resources return `404` without valid access.
- **Session:** Requires valid `__Host-goc_session` AES-256-GCM sealed cookie (`src/worker/auth/session.ts`).
- **Admin Session:** Requires valid session whose live D1 directory role is `admin` and status is `active`.
- **CSRF (`Origin`):** All non-safe methods (`POST`, `PUT`, `PATCH`, `DELETE`) on cookie-authenticated endpoints enforce `sameOriginViolation()` (`src/worker/auth/origin.ts`) and return `403 Forbidden` on mismatch.
- **Git PAT Basic:** HTTP Basic Auth with a D1 Personal Access Token (`goc_<8-hex>_<32-base32>`).

---

## 1. Git Smart HTTP v2 Endpoints (`src/worker/routes/git.ts`)

Both `/:owner/:repo/...` and `/:owner/:repo.git/...` are accepted.

| Method | Path                                               | Auth                                                        | Behavior & Notes                                                                                                                                                                                        |
| :----- | :------------------------------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/:owner/:repo/info/refs?service=git-upload-pack`  | Public repo: none; Private repo: Git PAT (`pull` or `push`) | Returns Protocol v2 capability advertisement (`application/x-git-upload-pack-advertisement`).                                                                                                           |
| `GET`  | `/:owner/:repo/info/refs?service=git-receive-pack` | Git PAT (`push`)                                            | Returns v0-style receive-pack ref & capability advertisement (`Cache-Control: no-store`). Unauthenticated requests receive `401 WWW-Authenticate: Basic realm="git", charset="UTF-8"`.                  |
| `POST` | `/:owner/:repo/git-upload-pack`                    | Public repo: none; Private repo: Git PAT (`pull` or `push`) | Supports `Content-Encoding: gzip` or `identity`. Handles v2 `ls-refs` and streaming `fetch` (`side-band-64k`). Returns `503 Retry-After: 5` (`X-Git-Error: repository-not-ready`) if repo has no packs. |
| `POST` | `/:owner/:repo/git-receive-pack`                   | Git PAT (`push`)                                            | Streaming R2 `.pack` + `.idx` write + atomic DO ref commit. Returns `503 Retry-After: 10` if another receive lease is active.                                                                           |

---

## 2. Public Discovery & Code Browser Routes (`src/worker/index.ts`, `src/worker/routes/ui.ts`)

| Method | Path                                   | Auth                                         | Response                                                                                                                                                                                  |
| :----- | :------------------------------------- | :------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/`                                    | Public / Optional Session                    | Homepage SSR (hero, `homePinned` public repos, recent/accessible repos)                                                                                                                   |
| `GET`  | `/explore`                             | Public / Optional Session                    | Public repository catalog SSR                                                                                                                                                             |
| `GET`  | `/namespaces`                          | Public / Optional Session                    | Active namespace directory SSR                                                                                                                                                            |
| `GET`  | `/profile/:owner`                      | Public / Optional Session                    | Explicit namespace profile SSR (canonical path for `@admin`)                                                                                                                              |
| `GET`  | `/:owner`                              | Public / Optional Session                    | Namespace profile & repository list SSR (with `.vibtools/profile/README.md`)                                                                                                              |
| `GET`  | `/:owner/:repo`                        | Public / Repo Access                         | Repository overview SSR                                                                                                                                                                   |
| `GET`  | `/:owner/:repo/tree`                   | Public / Repo Access                         | Tree browser (`?ref=<ref>&path=<dir>`)                                                                                                                                                    |
| `GET`  | `/:owner/:repo/blob`                   | Public / Repo Access                         | File viewer + syntax highlighting + web editor (`?ref=<ref>&path=<file>`)                                                                                                                 |
| `GET`  | `/:owner/:repo/commits`                | Public / Repo Access                         | Paginated commit history (`?ref=<ref>&per_page=50&page=0`)                                                                                                                                |
| `GET`  | `/:owner/:repo/commits/fragments/:oid` | Public / Repo Access                         | Merge side-branch commits fragment (`?limit=20`)                                                                                                                                          |
| `GET`  | `/:owner/:repo/commit/:oid`            | Public / Repo Access                         | Commit metadata & changed-file list (`A`/`M`/`D`)                                                                                                                                         |
| `GET`  | `/:owner/:repo/commit/:oid/diff`       | Public / Repo Access                         | Lazy JSON patch for a single path (`?path=<file>`)                                                                                                                                        |
| `GET`  | `/:owner/:repo/raw`                    | Public / Repo Access                         | Raw blob stream by OID (`?oid=<40-hex>&name=<file>[&download=1]`); always `text/plain` + `CSP: sandbox`                                                                                   |
| `GET`  | `/:owner/:repo/rawpath`                | Public / Repo Access + Same-Origin `Referer` | Raw blob by `?ref=<ref>&path=<file>[&download=1]`; rejects cross-origin hotlinks (`403`) and forces scriptable MIME types (`svg`, `html`, `xml`, `javascript`) to `text/plain` attachment |
| `GET`  | `/:owner/:repo/api/refs`               | Public / Repo Access                         | JSON list of branches & tags for navigation dropdown                                                                                                                                      |
| `GET`  | `/api/site-assets/:slot`               | Public                                       | Serves R2 branding asset (`logo`, `favicon`, `og-image`), `max-age=3600`                                                                                                                  |
| `GET`  | `/favicon.ico`                         | Public                                       | Serves R2 favicon, `302` external `faviconUrl`, or `204`                                                                                                                                  |
| `GET`  | `/robots.txt`                          | Public                                       | Dynamic robots rules driven by `branding.allowIndexing`                                                                                                                                   |

---

## 3. Authentication, Profile & Account APIs (`src/worker/routes/auth*.ts`)

### Web Pages

- `GET /auth` — Sign-in page (`?next=<safe-relative-path>`).
- `GET /user` — Redirects to `/user/account` (or `/auth?next=/user/account`).
- `GET /user/profile`, `/user/account`, `/user/accounts`, `/user/settings`, `/user/settings/security`, `/user/settings/tokens`, `/auth/account` — Signed-in user workspace tabs.

### Auth & Profile JSON Endpoints

| Method | Path                        | Auth & CSRF                     | Request Body (Zod Schema)                                                     | Notes                                                                       |
| :----- | :-------------------------- | :------------------------------ | :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| `POST` | `/auth/login`               | Public + CSRF                   | `{ username, password, next?, account? }` (`AdminLoginRequestSchema`)         | Rate limited: 8 failures / 300s (`429`). Issues `__Host-goc_session`.       |
| `POST` | `/auth/demo-login`          | Demo Mode only + CSRF           | `{ account?: "admin" \| "alex-dev", next? }`                                  | Returns `404` in Production Mode.                                           |
| `POST` | `/auth/sign-out`            | Optional Session + CSRF         | _(none)_                                                                      | Clears `__Host-goc_session` cookie.                                         |
| `POST` | `/auth/api/change-password` | Session (directory user) + CSRF | `{ currentPassword, newPassword }` (`ChangePasswordRequestSchema`)            | Rate limited (`change-password` scope). Password 8–128 chars.               |
| `PUT`  | `/auth/api/profile`         | Session + CSRF                  | `{ displayName?, bio, location, website }` (`ProfileMetaUpdateRequestSchema`) | Updates `namespace_directory_meta.display_name` & `namespace_profile_meta`. |

### User Repository & Web Commit Endpoints (`src/worker/routes/authRepositories.ts`)

| Method  | Path                                                  | Auth & CSRF                             | Request Body (Zod Schema)                                                                                                          | Notes                                                                |
| :------ | :---------------------------------------------------- | :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| `GET`   | `/auth/api/repositories`                              | Session                                 | —                                                                                                                                  | Lists repositories in namespaces where viewer is a member.           |
| `POST`  | `/auth/api/repositories`                              | Session (`admin`/`member`) + CSRF       | `{ namespaceSlug, slug, visibility, description?, initializeReadme?, initializeProfileReadme? }` (`RepositoryCreateRequestSchema`) | Creates D1 row, optional starter pack commit, and syncs `ROUTES` KV. |
| `PATCH` | `/auth/api/repositories/:repositoryId`                | Session (`admin` or ns `member`) + CSRF | `{ visibility?, description?, pinned?, homePinned? }` (`RepositoryPatchRequestSchema`)                                             | `homePinned` requires `admin` & `public` visibility.                 |
| `PUT`   | `/auth/api/repositories/:repositoryId/profile-readme` | Session (`admin` or ns `member`) + CSRF | `{ content, message }` (`ProfileReadmeUpdateRequestSchema`)                                                                        | Commits `profile/README.md` to `.vibtools` repo (max 256 KiB).       |
| `PUT`   | `/auth/api/repositories/:repositoryId/file`           | Session (`admin` or ns `member`) + CSRF | `{ path, content, message, ref }` (`RepoFileUpdateRequestSchema`)                                                                  | Commits file edit directly to R2 pack + DO ref (max 256 KiB).        |

### Personal Access Token Endpoints (`src/worker/routes/authTokens.ts`)

| Method   | Path                      | Auth & CSRF    | Request Body (Zod Schema)                                                                                                                                                                                       | Notes                                                         |
| :------- | :------------------------ | :------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ |
| `GET`    | `/auth/api/tokens`        | Session        | —                                                                                                                                                                                                               | Lists current user's PAT metadata (never returns plaintext).  |
| `POST`   | `/auth/api/tokens`        | Session + CSRF | Discriminated union by `scope` (`PatCreateRequestSchema`): `"repo"` (`name, namespaceSlug, repoSlug, level`), `"namespace"` (`name, namespaceSlug, level`), or `"global"` (`name, level` — active `admin` only) | Returns plaintext token **once** (`goc_<8-hex>_<32-base32>`). |
| `DELETE` | `/auth/api/tokens/:patId` | Session + CSRF | —                                                                                                                                                                                                               | Revokes a PAT owned by the signed-in user.                    |

---

## 4. Per-Repository Admin Endpoints (`src/worker/routes/admin.ts`)

Require browser Session + namespace membership (or `admin` role), plus CSRF on non-GET verbs. Git PATs are ignored.

| Method   | Path                                       | Body / Params                                                     | Behavior                                                                                                           |
| :------- | :----------------------------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/:owner/:repo/admin`                      | —                                                                 | Per-repository Admin Dashboard SSR                                                                                 |
| `GET`    | `/:owner/:repo/admin/refs`                 | —                                                                 | Returns DO refs array `[{ name, oid }]`                                                                            |
| `PUT`    | `/:owner/:repo/admin/refs`                 | `[{ name, oid }]` (`AdminRefsPayloadSchema`)                      | Overwrites DO refs and invalidates caches                                                                          |
| `GET`    | `/:owner/:repo/admin/head`                 | —                                                                 | Returns DO `Head` object `{ target, oid?, unborn? }`                                                               |
| `PUT`    | `/:owner/:repo/admin/head`                 | `{ target, oid?, unborn? }` (`AdminHeadPayloadSchema`)            | Updates DO `HEAD` and invalidates caches                                                                           |
| `POST`   | `/:owner/:repo/admin/compact`              | `{ dryRun?: false }` (`AdminCompactionRequestSchema`)             | Default `dryRun: true` previews compaction (`200`); `dryRun: false` requests/enqueues compaction (`202` if queued) |
| `DELETE` | `/:owner/:repo/admin/compact`              | —                                                                 | Clears pending compaction request                                                                                  |
| `GET`    | `/:owner/:repo/admin/debug-state`          | —                                                                 | Returns `RepoDurableObject.debugState()` JSON                                                                      |
| `GET`    | `/:owner/:repo/admin/debug-commit/:commit` | `:commit` (40-hex SHA)                                            | Verifies commit & tree presence                                                                                    |
| `GET`    | `/:owner/:repo/admin/debug-oid/:oid`       | `:oid` (40-hex SHA)                                               | Checks OID presence across storage layers                                                                          |
| `DELETE` | `/:owner/:repo/admin/pack/:packKey`        | `:packKey`                                                        | Deletes a **superseded** pack; returns `409` for active packs                                                      |
| `DELETE` | `/:owner/:repo/admin/purge`                | `{ confirm: "purge-<owner>/<repo>" }` (`AdminPurgeRequestSchema`) | Dispatches full repository deletion (`202` queued on Paid, `200` inline on Free, `503` on failure)                 |

---

## 5. Site Administration Control Panel (`src/worker/routes/systemAdmin.ts`)

Require active **`admin`** browser Session, plus CSRF on all mutations.

### Pages

- `GET /admin`, `/admin/repositories`, `/admin/tokens`, `/admin/users`, `/admin/settings` (redirected from `/admin/SettingsControlPanel`), `/admin/security`.

### Site Admin JSON APIs

| Method   | Path                                                                      | Request Body (Zod Schema)                                                                   | Behavior                                                                            |
| :------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------- |
| `GET`    | `/admin/api/overview`                                                     | —                                                                                           | Returns instance repositories, namespaces, tokens, and aggregate counters           |
| `GET`    | `/admin/api/users`                                                        | —                                                                                           | Lists all directory users/namespaces with roles, status, and repo counts            |
| `POST`   | `/admin/api/users` _(alias `/admin/api/namespaces`)_                      | `{ handle, displayName, role, status, password? }` (`AdminNamespaceCreateRequestSchema`)    | Creates user + namespace + membership + directory metadata                          |
| `PATCH`  | `/admin/api/users/:userId` _(alias `/admin/api/namespaces/:namespaceId`)_ | `{ handle?, displayName?, role?, status?, password? }` (`AdminNamespacePatchRequestSchema`) | Updates user/namespace; blocks disabling/demoting/password-overriding primary admin |
| `DELETE` | `/admin/api/users/:userId` _(alias `/admin/api/namespaces/:namespaceId`)_ | —                                                                                           | Deletes non-primary user/namespace                                                  |
| `PATCH`  | `/admin/api/repositories/:repositoryId`                                   | `RepositoryPatchRequestSchema`                                                              | Updates visibility, description, `pinned`, or `homePinned` for any repo             |
| `DELETE` | `/admin/api/repositories/:repositoryId`                                   | `{ confirm }` (`AdminRepositoryDeleteRequestSchema`)                                        | Dispatches repository deletion across D1, KV, R2, and DO                            |
| `DELETE` | `/admin/api/tokens/:patId`                                                | —                                                                                           | Revokes any user's PAT as site admin                                                |
| `PUT`    | `/admin/api/settings`                                                     | `AdminSettingsUpdateRequestSchema` (19 optional branding/SEO fields)                        | Persists sanitized site branding to KV (`site:branding:v1`)                         |
| `POST`   | `/admin/api/settings/asset/:slot`                                         | Raw image bytes (`logo` ≤ 512 KiB, `favicon` ≤ 512 KiB, `og-image` ≤ 2 MiB)                 | Validates magic bytes, stores in R2 (`site-assets/:slot`), updates KV URL           |
| `DELETE` | `/admin/api/settings/asset/:slot`                                         | —                                                                                           | Deletes R2 asset and clears its URL field in KV                                     |
