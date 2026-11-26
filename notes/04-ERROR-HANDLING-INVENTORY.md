# 04 — ERROR HANDLING INVENTORY & HARDENING SPECIFICATION

- **Document ID**: `004-ERROR-HANDLING-INVENTORY`
- **Baseline Reference**: `/notes/FORENSIC-PRODUCTION-AUDIT-REPORT.md`
- **Current Phase Progress**: `Phase 04 Completed (4 / 4 Phases Executed — 100% Complete)`

---

## 1. Existing Error Handling Verified in Live Source Tree

### 1.1 Top-Level Worker & Hono Error Boundary (`src/worker/index.ts`)

- **`app.onError` (`src/worker/index.ts:272-298`)**:
  - Catches any unhandled exception escaping Hono/itty-router handlers.
  - Emits structured error logs via `createLogger(c.env.LOG_LEVEL, { service: "Worker" }).error("request:unhandled-error", ...)`.
  - When `c.env.LOG_LEVEL === "debug"`, passes the raw error to `handleError`; otherwise masks the error with `new HttpError(500, "Internal Server Error")`.
  - For JSON routes (`/auth/api/*`, `/admin/api/*`, `/:owner/:repo/admin/*`), returns `{ ok: false, error: "Internal Server Error" }` with status `500` and `Cache-Control: no-store`.

### 1.2 Git Smart HTTP v2 Protocol & Receive Pipeline (`src/worker/routes/git.ts`, `src/worker/git/receive/pipeline.ts`)

- **Authentication & Authorization (`src/worker/auth/gitAuth.ts:55-161`)**:
  - `401 Unauthorized` with `WWW-Authenticate: Basic realm="git-on-cloudflare", charset="UTF-8"` for missing/invalid credentials or anonymous private repo access.
  - `403 Forbidden` when an authenticated user/PAT lacks namespace/repo grant or attempts `git-receive-pack` with a `"pull"`-only token.
  - `404 Not Found` when the repository or namespace does not exist.
- **Receive Lease Contention & Pack Failures (`src/worker/git/receive/pipeline.ts:62-215`)**:
  - Concurrent push during an active lease returns `503 Service Unavailable` with `Retry-After: 10` (`receiveBusyResponse`).
  - Subrequest or pack limit exhaustion returns pkt-line `unpack-error` report-status or HTTP `413` / `400`.
  - `finally` block guarantees staged R2 pack cleanup (`deleteStagedPack`) and lease release (`stub.abortReceive(leaseToken)`).

### 1.3 Auth, Session, CSRF & Personal Access Token APIs (`src/worker/routes/auth*.ts`)

- **CSRF Guard (`src/worker/routes/authShared.ts:38-84`)**:
  - Verifies `Origin` / `Referer` against request host on all mutating `/auth/api/*` and `/admin/api/*` endpoints; rejects cross-origin requests with `403 { error: "cross-origin-request-rejected" }`.
- **Rate Limiting (`src/worker/do/auth/authDO.ts`)**:
  - Enforces per-IP sliding-window login and password-verification rate limits (`429 Too Many Requests` with `Retry-After`).
- **Role & Input Validation (`src/worker/routes/authRepositories.ts`, `src/worker/routes/authTokens.ts`)**:
  - Rejects `viewer` role mutations with `403 { ok: false, reason: "viewer-read-only" }`.
  - Rejects non-admin `scope: "global"` PAT creation with `403 { error: "admin-only-global-scope" }`.
  - Validates slugs, visibility, branch refs, file paths, and file size limits with explicit tagged error reasons (`invalid-slug`, `invalid-ref`, `invalid-path`, `too-large`, `repo-busy`).
- **Git Tree Mode & Path Conflict Validation (`src/worker/git/commitFile.ts:133-240` — Added in Phase 02)**:
  - `resolveUpsertTreeEntryPlan` rejects leaf overwrites of non-regular entries (`40000`, `120000`, `160000`) and intermediate traversal through non-directory entries with `{ ok: false, reason: "invalid-path", detail }` (`HTTP 400`).

### 1.4 Durable Object & Queue Task Resilience (`src/worker/do/repo/repoDO.ts`, `src/worker/tasks/*.ts`)

- **Tagged-Union RPC Outcomes**:
  - `beginReceive`, `finalizeReceive`, `beginCompaction`, and `commitCompaction` return typed tagged unions (`busy`, `committed`, `stale-lease`, `packset-changed`, `ref-conflict`) rather than throwing exceptions across DO boundaries.
- **Queue Retry & Dead-Letter Avoidance (`src/worker/tasks/compaction.ts`, `src/worker/tasks/refBackfill.ts`, `src/worker/tasks/repositoryDelete.ts`)**:
  - Transient errors clean up staged R2 artifacts, release active DO leases, and call `retryQueueMessage(message, delaySeconds)`.
  - Deterministic corrupt pack failures in `refBackfill.ts` (`isDeterministicPackFailure`) log a warning and `ack()` to avoid infinite retry loops.

---

## 2. Error Handling Gaps Found in Audit & Hardening Status

| Bug ID       | Target Phase | Error Handling Gap in Baseline                                                                                                                                                                                                                                                                                                                                                                                                       | Hardening Status                                                                                                                                                                                                                                                                                      |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUG-NEW-10` | **Phase 02** | `upsertTreePath` (`src/worker/git/commitFile.ts`) silently overwrote an existing file with a directory (or vice versa) when a conflicting path was submitted to `PUT /auth/api/repositories/:id/file`.                                                                                                                                                                                                                               | **COMPLETED (Phase 02)**: `resolveUpsertTreeEntryPlan` returns `{ ok: false, reason: "invalid-path", detail }` when a leaf targets a non-regular file entry (`40000`, `120000`, `160000`) or an intermediate segment hits a non-directory entry, returning `400` before acquiring a DO receive lease. |
| `BUG-NEW-08` | **Phase 04** | 1. `handleError` (`src/client/server/error.ts:95-120`) rendered raw 500 error messages into HTML even when `LOG_LEVEL !== "debug"`.<br>2. `handleError` and `tree.ts:106-118` omitted `loadSiteBranding(env)`.<br>3. `badRequest` and `handleError` calls in `blob.ts`, `tree.ts`, `commits.ts`, and `overview.ts` omitted `viewer: access.viewer`, causing signed-in users to see a signed-out navbar/sidebar on 400/404/500 pages. | **COMPLETED (Phase 04)**: `resolvePublicErrorMessage` sanitizes 500 HTML messages in `handleError` when `LOG_LEVEL !== "debug"`, loads `branding = await loadSiteBranding(env)`, and threads `viewer` across all `badRequest` and `handleError` routes.                                               |
| `BUG-NEW-09` | **Phase 04** | 1. `handleRefsApi` (`src/worker/routes/ui/refsApi.ts:32-40`) returned raw `e.message` on HTTP 500 without logging or `Cache-Control: no-store`.<br>2. Five endpoints in `src/worker/routes/admin.ts` (`POST /admin/compact`, `DELETE /admin/compact`, `GET /admin/debug-commit/:commit`, `GET /admin/debug-oid/:oid`, `DELETE /admin/pack/:packKey`) returned raw `json({ error: String(e) }, 500)` without logging.                 | **COMPLETED (Phase 04)**: Logs structured warnings and returns sanitized `500` JSON responses across `handleRefsApi` and all 5 endpoints in `src/worker/routes/admin.ts`.                                                                                                                             |
