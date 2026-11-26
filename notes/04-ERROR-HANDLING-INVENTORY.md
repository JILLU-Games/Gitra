# 04 — Error Handling Forensic Inventory (Req 004)

> **Scope:** Exact map of (1) all error-handling boundaries already implemented across Workers, SSR, Git streaming, RepoDO, Queue consumers, Auth, and React Islands, and (2) every verified missing, silent, or broken error handler scheduled for remediation across Phases 01–05.

---

## Part A — Currently Implemented Error Handling (Baseline Verified)

### 1. Worker Global Boundary & Content Negotiation

- **Hono Global `onError` (`src/worker/index.ts:255-304`):**
  - Classifies JSON vs HTML callers via `wantsJsonErrorResponse(c)` (`:231-253` — covers `/api/`, `/commits/fragments/`, `/commit/:oid/diff`, `/info/refs`, `/git-upload-pack`, `/git-receive-pack`, `/admin/(status|storage|debug-state|...)`, `Accept: application/json`, and non-GET/HEAD requests).
  - Logs `"worker:unhandled-error"` with `status`, `path`, `error`.
  - Masks internal error messages on `5xx` unless `LOG_LEVEL=debug`, renders SSR `"error"` view, and falls back to XSS-safe `buildEscapedErrorHtmlDocument` (`src/client/server/error.ts:66-85`) if SSR itself throws.
- **Request Middleware `finally` Consistency (`src/worker/routes/hono.ts:112-116`):**
  - Runs `emitD1Bookmark(c, session, inboundBookmark)` inside `try { await next(); } finally { ... }` so D1 bookmark headers ship even if a handler throws.
- **D1 Isolate Schema Retry (`src/worker/db/d1/bootstrap.ts:131-142`):**
  - Deletes cached `ensuredDatabases` promise on rejection so transient D1 boot errors can retry on the next request.
- **Shared HTTP/UI Error Helpers (`src/client/server/error.ts:13-140`):**
  - `getErrorMessage`, `getErrorStack`, `resolveErrorStatus` (`HttpError` status -> numeric `status` `400..599` -> `/not found/i` => `404` -> else `500`), `isGitReadMissError`, `handleError`.

### 2. Git Smart HTTP Streaming & Queue Consumer

- **Streaming Upload-Pack (`src/worker/git/operations/uploadStream/index.ts:27-146`):**
  - Handles `signal?.aborted` (`499`), empty/not-ready repos (`503 repositoryNotReadyResponse`), and `FetchPlanRetryError` (`503` + `Retry-After` + `X-Git-Error` header) BEFORE streaming HTTP `200`.
  - Once the HTTP `200` stream starts, wraps assembly/piping in `try/catch` and emits Git protocol sideband fatal errors via `emitFatal(controller, ...)` (`:127, :142`).
- **Streaming Receive-Pack (`src/worker/git/receive/pipeline.ts:27-151, 314-386`):**
  - Typed `ReceivePipelineHttpError` for pre-stream HTTP errors (`503 lease-mismatch` at `:322`).
  - `cleanupFailedReceive` aborts the DO receive lease and deletes staged R2 pack files inline, scheduling `ctx.waitUntil` retry if inline cleanup fails (`:120-150`).
- **Queue Task Dispatcher (`src/worker/tasks/queue.ts:22-55`):**
  - Validates every queue message with `RepoTaskQueueMessageSchema.safeParse`; malformed payloads log `"queue:malformed-message"` and `message.ack()` (`:30`) to prevent infinite poison-message retries.
  - `repositoryDelete.ts:51-135` uses bounded subrequest budgets and retryable `message.retry()` cleanly across D1/KV/R2/DO steps.

### 3. Authentication, Zod Schemas & Admin Endpoints

- **Centralized Input Schemas (`src/worker/routes/requestSchemas.ts:1-251`):**
  - 13 Zod schemas (`RepositoryCreateRequestSchema`, `PatCreateRequestSchema`, `AdminLoginRequestSchema`, `AdminNamespacePatchRequestSchema`, etc.) + `safeParseJsonRequest` handling malformed JSON gracefully without unhandled `SyntaxError` `500`s.
- **Typed Auth & Verification Unions:**
  - `PatVerifyResult` (`src/worker/auth/pat.ts:118-142`): `"malformed" | "username-mismatch" | "token-not-found" | "token-revoked" | "token-expired" | "grant-missing"`.
  - Explicit auth error codes redirected via `?error=missing_credentials|account_disabled|invalid_credentials|session_create_failed` (`src/worker/routes/authLogin.ts:55-61`).
  - Non-disclosure rule (`src/worker/routes/ui/helpers.ts:252-279`): private repo access errors return `404` HTML or `{ error: "Not found" }` JSON identically for anonymous and non-member users.
- **Repo Purge Queue Guard (`src/worker/routes/admin.ts:272-280`):**
  - Returns `503 { ok: false, error: "Failed to enqueue delete; please retry" }` before mutating any state if `REPO_TASKS_QUEUE.send` rejects.

### 4. Client Islands (Partial Structured Handling)

- **`blob-editor.tsx:50-81`:** Displays inline `role="alert"` error banners on `409 repo-busy`, HTTP failures, and `catch` network errors without dialogs.
- **`tokens.tsx:167-237, 248-260`:** Detects `401 Session expired` with an inline `<a href="/auth">Sign in</a>` prompt (`ErrorBanner`), plus clipboard-unavailable fallback message (`:468-472`).

---

## Part B — Missing, Silent, or Broken Error Handlers To Add / Fix

| ID         | Location (`file:line`)                                                                                           | Current Defect / Silent Failure                                                                                                                                                     | Exact Target Fix                                                                                                                                                                                                                                                                         |    Target Phase     |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------------: |
| **ERR-01** | `src/worker/routes/ui/helpers.ts:349-351, 399-401`                                                               | ~~Missing role authorization error (`403 Forbidden`) when `viewer` hits repo admin page/API (`BUG-01`).~~                                                                           | **FIXED (Phase 01):** Returns `adminForbidden()` (`403` text) / `adminJsonError("Forbidden", 403)` when `!canWriteRepositories(viewer.role)`.                                                                                                                                            | **DONE (Phase 01)** |
| **ERR-02** | `src/worker/auth/pat.ts:190-220, 244-290`                                                                        | ~~Missing disabled-owner & role-demotion rejection on scoped PAT verification (`BUG-02`).~~                                                                                         | **FIXED (Phase 01):** `resolvePatOwnerPolicy` rejects disabled owners with `token-revoked`, fails closed (`grant-missing`) on D1 errors, and caps `viewer` grants to `"pull"`.                                                                                                           | **DONE (Phase 01)** |
| **ERR-03** | `src/worker/auth/session.ts:278-294`                                                                             | ~~Empty `catch {}` swallows D1 lookup failures and falls open to `role: "member"` (`BUG-03`).~~                                                                                     | **FIXED (Phase 01):** Logs `"session:directory-lookup-failed"` and returns `null` (fail closed) on D1 errors; falls back to `"viewer"` when row missing.                                                                                                                                 | **DONE (Phase 01)** |
| **ERR-04** | `src/worker/routes/ui/raw.ts:11-25, 50-60, 108-120`                                                              | ~~Unsanitized filename interpolation allows HTTP header injection (`BUG-04`).~~                                                                                                     | **FIXED (Phase 01):** Enforces `sanitizeContentDispositionFilename` + `CSP: sandbox` + `nosniff` + `text/plain` / `attachment` for scriptable types.                                                                                                                                     | **DONE (Phase 01)** |
| **ERR-05** | `src/worker/routes/systemAdmin.ts:535-575, 825-865`                                                              | ~~Missing queue failure error handling (uses direct `deleteRepositoryById` instead of `REPO_TASKS_QUEUE.send`); wrong `403 not-member` blocks admins (`BUG-05`).~~                  | **FIXED (Phase 02):** Both `DELETE /admin/api/repositories/:id` and `DELETE /admin/api/users/:id` enqueue `repository-delete` via `REPO_TASKS_QUEUE.send`, return `503` before D1 mutation on send failure, and authorize admins cross-namespace.                                        | **DONE (Phase 02)** |
| **ERR-06** | `src/worker/git/commitFile.ts:53-99, 217-225, 342-353, 430-438`; `src/worker/routes/authRepositories.ts:501-509` | ~~Missing `abortReceive(token)` when `finalized.status !== "committed"`, missing R2 `.pack`/`.idx`/`.refs` cleanup on error (`BUG-15`), and missing tag-ref rejection (`BUG-08`).~~ | **FIXED (Phase 03):** `resolveEditableBranchRef` rejects `refs/tags/*`, short tag names, commit OIDs, and non-branch refs (`invalid-ref` -> `400`); `cleanupFailedWebCommit` aborts DO receive lease & cleans staged R2 `.pack`/`.idx`/`.refs` on both non-committed status and `catch`. | **DONE (Phase 03)** |
| **ERR-07** | `src/worker/git/operations/read/tree.ts:35-75`; `src/worker/git/pack/indexer/connectivity.ts:88-125, 179-279`    | ~~Single-hop `tag -> commit` throws `"Unsupported object type"` / commit parse crash on nested tags or tree/blob tags; shallow push connectivity (`BUG-14`).~~                      | **FIXED (Phase 03):** Bounded multi-hop tag peel (`MAX_TAG_DEPTH = 8`) in `read/tree.ts` dispatches to `commit`, `tree`, and `blob`; `connectivity.ts` adds bounded recursive `verifyTree` (skipping `160000` gitlinks) and parent commit walk.                                          | **DONE (Phase 03)** |
| **ERR-08** | `src/worker/routes/admin.ts:106, 121, 148, 160`                                                                  | ~~`PUT /admin/refs` & `PUT /admin/head` lack `try/catch` around DO RPCs; `GET /refs` (`:107`) & `GET /debug-state` (`:161`) swallow DO failures silently into `[]` / `{}`.~~        | **FIXED (Phase 04):** Wrapped `GET /refs`, `PUT /refs`, `PUT /head`, and `GET /debug-state` DO RPCs with structured `warn` logging and explicit `500/503` JSON error responses rather than silent fallback data.                                                                         | **DONE (Phase 04)** |
| **ERR-09** | `src/worker/routes/ui/commits.ts:149-155, 188-193, 204-219, 244-250`                                             | ~~JSON API handlers `handleCommitFragments` and `handleCommitDiff` return HTML `badRequest(...)` and `handleError(...)` pages instead of JSON (`BUG-20`).~~                         | **FIXED (Phase 04):** Updated `resolveUiRepoAccess(..., { responseShape: "json" })` and validation/runtime catch paths in `handleCommitFragments` & `handleCommitDiff` to return `{ error }` JSON with `400 \| 404 \| 500` status codes.                                                 | **DONE (Phase 04)** |
| **ERR-10** | `src/client/islands/repo-admin/*` (12 calls), `repositories.tsx`, `tokens.tsx`                                   | ~~Native `window.alert` / `confirm` / `prompt` fail silently or abort in embedded iframes (`BUG-12`).~~                                                                             | **FIXED (Phase 04):** Replaced every native dialog with accessible React `<ConfirmModal>` dialogs (with typed phrase confirmation for destructive purge), inline red validation text (`oidError`), inline notice banners, and clipboard labels.                                          | **DONE (Phase 04)** |
| **ERR-11** | `src/worker/routes/authLogin.ts`, `src/worker/auth/rateLimit.ts`                                                 | ~~No HTTP `429 Too Many Requests` / lockout error handling on repeated failed `/auth/login` or `/auth/api/change-password` attempts (`BUG-16`).~~                                   | **FIXED (Phase 04):** Added KV sliding-window rate limiter returning `303 ?error=rate_limited` / `429 JSON` on `/auth/login` and `429` JSON with `Retry-After` on `/auth/api/change-password`.                                                                                           | **DONE (Phase 04)** |
| **ERR-12** | `src/worker/db/d1/dal/adminDirectory.ts` & `src/worker/routes/git.ts`                                            | ~~Empty `catch {}` blocks silently hide `tessera_sub` update errors (`BUG-22`) and `loadPeeledTagTargets` failures (`git.ts`).~~                                                    | **FIXED (Phase 04):** Logged `directory:subject-update-conflict` warnings when updating `tessera_sub` conflicts on unique constraint and logged `git:peeled-tag-load-failed` in `git.ts` rather than swallowing failures silently.                                                       | **DONE (Phase 04)** |
