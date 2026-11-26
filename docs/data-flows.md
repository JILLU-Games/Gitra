# Data Flows

> **See Also:** **[`docs/dev/architecture.md`](./dev/architecture.md)** for full Mermaid sequence/topology diagrams and **[`docs/dev/api-reference.md`](./dev/api-reference.md)** for exact endpoint contracts.

This document summarizes Gitra's primary runtime data flows verified from `src/worker/`.

## 1. Git Push (`POST /:owner/:repo/git-receive-pack`)

1. Worker resolves the repository route (KV route cache with D1 fallback for authenticated requests) and verifies a D1 Personal Access Token with `level = "push"` (`src/worker/auth/pat.ts`), enforcing live directory role/status checks.
2. Worker acquires an exclusive receive lease on `RepoDurableObject` via `beginReceive()`. Concurrent pushes receive `503 Retry-After: 10`.
3. Worker parses pkt-line ref commands, streams the `.pack` directly to R2 (`do/<doId>/objects/pack/`), builds `.idx` and `.refs` sidecars inline, and writes them to R2.
4. Worker commits refs and `pack_catalog` metadata atomically via `finalizeReceive()`.
5. Worker updates `repositories.updated_at` in D1, invalidates branch/refs caches, and (on Paid tier with `REPO_TASKS_QUEUE`) may schedule asynchronous compaction.

## 2. In-Browser File & Profile README Commits

- `PUT /auth/api/repositories/:repositoryId/file` and `PUT /auth/api/repositories/:repositoryId/profile-readme` (`src/worker/routes/authRepositories.ts`, `src/worker/git/commitFile.ts`) accept up to `256 KiB`, construct real Git blob/tree/commit objects, stage a `.pack` + `.idx` in R2, acquire the DO receive lease, and commit atomically.

## 3. Git Fetch (`POST /:owner/:repo/git-upload-pack` v2)

1. Client discovers protocol v2 capabilities via `GET /:owner/:repo/info/refs?service=git-upload-pack`.
2. `ls-refs`: Loads `HEAD` and refs from `RepoDurableObject` (cached 60s for public repos; bypassed for private repos), optionally peeling annotated tags via `loadPeeledTagTargets()`.
3. `fetch`:
   - Negotiation (`done` absent) returns acknowledgments only (`ACK`/`NAK`).
   - Loads active `pack_catalog` via `src/worker/git/object-store/catalog.ts#loadActivePackCatalog()` (memoized per request under `SubrequestLimiter`).
   - Streams packfile assembly directly from R2 (`streamPackFromR2()` or `streamPackFromMultiplePacks()`) using `crypto.DigestStream` for incremental SHA-1 and `side-band-64k` framing.
   - Empty repos return `503` with `Retry-After: 5` and `X-Git-Error: repository-not-ready`.

## 4. Web UI Code Browsing, Diffs & Raw Streaming

- **Blob & Tree views** (`src/worker/routes/ui/`): Resolve paths via worker-local pack-first object store, using `git-on-cf:json` and `git-on-cf:objects` caches for public repos (bypassed for private repos).
- **Commit Diffs**: `GET /:owner/:repo/commit/:oid` renders changed files (`A`/`M`/`D`); `GET /:owner/:repo/commit/:oid/diff?path=<file>` lazily loads per-file patches.
- **Raw views**: `/raw` always serves `text/plain; charset=utf-8` + `CSP: sandbox`; `/rawpath` enforces same-origin `Referer` hotlink protection and forces scriptable MIME types (`svg`, `html`, `xml`, `javascript`) to `text/plain` attachment.

## 5. Repository Deletion & Free/Paid Background Dispatch

- `DELETE /:owner/:repo/admin/purge` and `DELETE /admin/api/repositories/:repositoryId` dispatch via `dispatchRepositoryDelete()` (`src/worker/tasks/dispatch.ts`):
  - **Paid tier (`REPO_TASKS_QUEUE` bound):** Enqueues `repository-delete` (`202 Accepted`) for reliable queue execution (`src/worker/tasks/repositoryDelete.ts`).
  - **Free tier (no Queue):** Executes deletion inline (`200 OK`).
- Deletion removes R2 objects from the Worker first and then calls `stub.clearRepositoryStorage()` for DO-only cleanup, preserving single-hop boundary rules.
