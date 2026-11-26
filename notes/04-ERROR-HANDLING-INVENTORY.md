# 04 · Error Handling Inventory (Existing vs. Required Additions)

Grounded strictly in verified live source files (`src/worker/`, `src/client/`, `scripts/`).

---

## Part A — Existing Error Handling (Verified Live in Source)

### 1. Worker Top-Level Boundaries (`src/worker/index.ts`)
- **404 Not Found (`index.ts:267-282`):** Renders SSR `"404"` document (with fallback `"Not found\n"` status `404`).
- **Global `app.onError` (`index.ts:308-357`):**
  - Resolves HTTP status (`resolveErrorStatus`), logs `worker:unhandled-error`, and detects JSON routes via `wantsJsonErrorResponse` (`/api/`, Git Smart HTTP endpoints, repo admin JSON routes, `Accept: application/json`, non-GET).
  - Masks internal `5xx` details in non-debug mode (`LOG_LEVEL !== "debug"`) and wraps SSR `"error"` view inside fallback `buildEscapedErrorHtmlDocument(...)`.

### 2. Authentication, Setup, CSRF & Rate-Limit Errors (`src/worker/auth/`, `src/worker/routes/auth*.ts`, `systemAdmin.ts`)
- **Same-Origin CSRF Guard (`origin.ts`):** Mutating endpoints (`POST/PUT/PATCH/DELETE`) call `sameOriginViolation(c)` and log `same-origin-violation`.
- **Zod Payload Validation (`requestSchemas.ts`):** All JSON bodies parsed via `safeParseJsonRequest` + Zod `.safeParse(...)`, returning explicit `400` tagged reasons (`invalid-payload`, `invalid-slug`, `slug-taken`, `password-too-short`, `password-too-long`, `private-repo-cannot-feature`).
- **Login & Setup Query Redirect Codes (`AuthSignInPage.tsx:17-34`):** Maps structured URL error codes: `missing_credentials`, `invalid_credentials`, `account_disabled`, `rate_limited` (`429` + `Retry-After`), `session_create_failed`, `setup_locked`, `invalid_username`, `password_mismatch`, `weak_password`.
- **Session Fail-Closed (`session.ts:159-169, 196-206, 273-293`):** Missing/blank/placeholder `SESSION_SECRET` fails closed in Production (`missing_session_secret`); disabled directory accounts (`status === "disabled"`) or D1 directory read failures immediately return `null` session.
- **Role Guards (`systemAdmin.ts:87-98`, `admin.ts`, `authRepositories.ts`):** Reject non-admin sessions (`401` / `403` / `303` redirect) and enforce primary-admin delete/demote policy (`evaluatePrimaryAdminPatchPolicy`, `canRemoveNamespaceEntry`).

### 3. Git Smart HTTP v2, Streaming Receive & Repo DO (`src/worker/routes/git.ts`, `streamReceivePack.ts`, `fetch/plan.ts`, `do/repo/repoDO.ts`)
- **Upload-Pack (`git.ts:85-93, 113-117, 210`):** Invalid gzip -> `400`; missing protocol v2 header/command -> `400`; unsupported v2 command -> `400`.
- **Fetch Closure Budget & Missing Sidecars (`fetch/plan.ts:185-205`):** Missing `.refs` throws `FetchPlanRetryError` (`503 Retry-After: 10`); closure budget exceedance is logged and handled gracefully.
- **Streaming Receive-Pack (`streamReceivePack.ts:121-140` & leases):** Maps `ReceivePipelineHttpError` status, pack header/version -> `415`, malformed/missing/delta resolution -> `400`, concurrent push lease busy -> `503 Retry-After: 10`, invalid refs/preflight conflicts -> Git pkt `report-status`.
- **Repo DO RPC Policy (`repoDO.ts`, `catalog/compaction/requests.ts`, `packOperations.ts`):** Uses tagged unions (`ok / rejected / queued / no_work`) rather than throwing across RPC boundaries; cleans up staged R2 keys on web-commit abort (`commitFile.ts:83-106`).
- **Queue Delete Safety (`admin.ts:334-347`, `systemAdmin.ts:653-671`):** Fails safely with `503` before deleting D1 rows if `repository-delete` queue dispatch or inline cleanup throws.

### 4. Client UI & Auto-Deploy Error Handling
- **SSR & Form Banners (`src/client/components/ui/error-banner.tsx`, `confirm-modal.tsx`, `admin-settings.tsx`, `change-password.tsx`, `UserFormModal.tsx`):** Inline `role="alert"` banners show validation/API failures per form/modal.
- **Auto-Deploy CLI (`scripts/cf-auto-deploy.mjs:529-532`):** Fails fast on non-zero child command exit or API error and prints message to stderr.

---

## Part B — Missing / Broken Error Handling To Add (Mapped to Phases)

| Finding | File / Path | Current Defect in Error Handling | Required Error-Handling Fix | Phase |
| :--- | :--- | :--- | :--- | :--- |
| **`F-04`** | `src/worker/routes/authLogin.ts:618-652` | Sequential unbatched D1 writes during `/auth/setup`; mid-flight failure leaves `users` row behind and locks setup with `setup_locked` | Atomic D1 batching or rollback cleanup on failure so partial errors return retryable `500`/redirect without corrupting D1 state | **Phase 01** |
| **`F-07`** | `src/worker/auth/rateLimit.ts:119-153` | Silently ignores missing `ROUTES` KV or KV `get`/`put` exceptions (fail-open) and suffers RMW races | Add isolate-local fallback counter map + log degraded KV mode instead of silent open pass | **Phase 01** |
| **`F-08`** | `src/worker/auth/cookies.ts:17-23` | Hardcodes `__Host-` + `Secure`; on plain-HTTP non-localhost deployments, browsers silently reject the cookie and redirect back to `/auth` with **no error explanation** | Dynamically toggle secure/non-secure cookie options based on HTTPS vs plain-HTTP request protocol | **Phase 01** |
| **`F-09`** | `src/worker/git/operations/fetch/plan.ts:185-188` | Throws `503 Retry-After: 10` (`missing-ref-index`) even when `REPO_TASKS_QUEUE` is absent so backfill never starts | Fallback to bounded inline backfill when Queue is absent, or return explicit `503` diagnostic reason when backfill still fails | **Phase 02** |
| **`F-10`** | `src/worker/routes/admin.ts:69-96`, `requests.ts:103-122` | Silently drops `sendOptionalMaintenanceTask` (`false`) when Queues disabled while returning `202 { status: "queued" }` forever | Return explicit `409` / `501` (`queues-required`) or run safe bounded compaction; emit clear Free-tier CPU guard warnings | **Phase 02** |
| **`F-17`** | `src/worker/routes/git.ts:95-117` | Rejects v0/v1 clients with raw `400` despite JSDoc claiming legacy support | Support legacy v0/v1 or return explicit structured Smart HTTP error with accurate protocol message | **Phase 02** |
| **`F-19`** | `src/worker/routes/git.ts:221-247` | Swallows D1 `touchRepositoryUpdatedAt` & KV cleanup errors silently inside `waitUntil` | Await sync or enqueue retry task + structured `error` telemetry when invalidation fails | **Phase 02** |
| **`F-13`** | `home-repos.tsx:325`, `RepositoriesSection.tsx:247`, `TokensSection.tsx:112`, `blob-actions.tsx:33` | Silent `catch {}` or `console.warn` on Clipboard API failure; no global Toast for API/action success or failure | Add global `<ToastProvider />` surfacing exact original API & clipboard errors/successes everywhere | **Phase 04** |
| **`F-20`** | `scripts/cf-auto-deploy.mjs:476-511` | Deploys Worker *before* uploading `SESSION_SECRET` (causing temporary `session_create_failed` errors on first live traffic) | Pre-reconcile required Worker secrets or fail cleanly prior to exposing first deploy traffic | **Phase 05** |
