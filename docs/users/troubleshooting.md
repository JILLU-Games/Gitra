---
title: Troubleshooting Guide
description: Verified error codes, failure modes, and recovery steps for Gitra CLI, web sessions, and Cloudflare deployments.
order: 6
draft: false
---

# Troubleshooting Guide

Every error message, HTTP status code, and recovery step in this guide is traced directly to Gitra's runtime implementation.

---

## Git CLI & Smart HTTP Errors

### `401 Unauthorized` when running `git push` or cloning a private repo

- **Cause:** Missing HTTP Basic credentials, malformed PAT format, revoked/expired PAT, or HTTP Basic username mismatch (`src/worker/routes/git.ts`, `src/worker/auth/pat.ts`).
- **Fix:**
  1. Confirm you are using a **Personal Access Token** (`goc_<8-hex>_<32-base32>`), **not** your web login password.
  2. For repo/namespace PATs, ensure the HTTP Basic **username matches the repository's `:owner` namespace slug** exactly.
  3. For Global Admin PATs, the HTTP Basic username must match either `:owner` or one of the admin's own namespace slugs.
  4. Verify the token has not been revoked in `/user/settings/tokens` or `/admin/tokens`.

### `403 Forbidden` when running `git push`

- **Cause:** One of three verified conditions (`src/worker/routes/git.ts#gateGitPush`, `src/worker/auth/pat.ts`):
  1. The PAT only has `pull` (Read-Only) permission instead of `push` (Read & Write).
  2. The PAT is valid, but does not have a grant for the target namespace or repository (`grant-missing`).
  3. The PAT owner's directory role is `viewer` (viewer accounts are strictly downgraded to `pull` at verification time).
- **Fix:** Mint a new PAT with **Read & Write (`push`)** scope for the target repo/namespace, or ask an admin to upgrade your role to `member` or `admin` in `/admin/users`.

### `400 Expected Git protocol v2 (set Git-Protocol: version=2)`

- **Cause:** An older Git client sent a legacy v0/v1 `POST /:owner/:repo/git-upload-pack` request without `Git-Protocol: version=2` or a v2 `command=` body (`src/worker/routes/git.ts#handleUploadPackPOST`).
- **Fix:** Upgrade Git CLI to `2.26+` or run `git config --global protocol.version 2`.

### `503 Service Unavailable` with `Retry-After: 10` on `git push`

- **Cause:** Another push currently holds the repository's single active receive lease in `RepoDurableObject` (`src/worker/do/repo/repoDO.ts#beginReceive`).
- **Fix:** Wait 10 seconds and retry `git push`. Expired leases are automatically cleaned up by the DO `alarm()` handler.

### `503 Service Unavailable` with `Retry-After: 5` and `X-Git-Error: repository-not-ready` on `git clone` / `fetch`

- **Cause:** The repository exists in D1 but has no packs committed yet (empty repository).
- **Fix:** Push an initial commit or initialize a `README.md` via the web UI first.

---

## Web Authentication & Session Errors

### `403 Forbidden` on login, sign-out, or API mutations

- **Cause:** Failed same-origin CSRF verification (`src/worker/auth/origin.ts#sameOriginViolation`). Every non-safe HTTP request (`POST`, `PUT`, `PATCH`, `DELETE`) requires an `Origin` header matching the request URL, `X-Forwarded-Host` / `Forwarded` / `Host`, or (on loopback reverse proxies) `Sec-Fetch-Site: same-origin` with an HTTPS `Origin`.
- **Fix:** Perform browser mutations from the same domain serving Gitra. If running behind a reverse proxy, ensure `Origin` and `X-Forwarded-Host` / `X-Forwarded-Proto` headers are preserved.

### `429 Too Many Requests` on `/auth/login` or `/auth/api/change-password`

- **Cause:** Rate limiter triggered (`src/worker/auth/rateLimit.ts`): **8 failed attempts within 300 seconds (5 minutes)** per `(scope, client-ip, target-handle)` stored in `ROUTES` KV (`auth-rl:*`).
- **Fix:** Wait for the `Retry-After` interval (up to 5 minutes) before retrying. A successful login clears the counter immediately.

### Cannot sign in as primary `admin` in Production

- **Cause:** In Production Mode (`vite build` or `AUTH_MODE=production`), Gitra **fails closed** when `ADMIN_PASSWORD` or `SESSION_SECRET` is missing—it never falls back to `admin123` or an ephemeral session key (`src/worker/auth/adminAuth.ts`, `src/worker/auth/session.ts`).
- **Fix:** Ensure both `ADMIN_PASSWORD` and `SESSION_SECRET` are deployed as Worker secrets (either via `npm run cf:auto-deploy` or `wrangler secret put`).

### Signed out immediately after redeploying

- **Cause:** `SESSION_SECRET` changed between deployments, invalidating existing AES-256-GCM sealed `__Host-goc_session` cookies (`src/worker/auth/session.ts`).
- **Fix:** Always use `npm run cf:auto-deploy` (which automatically preserves existing Worker secrets unless `--rotate-secrets` or `FORCE_ROTATE_SECRETS=true` is passed).

---

## Raw File & Web UI Errors

### `403 Hotlinking not allowed` on `/:owner/:repo/rawpath`

- **Cause:** `GET /:owner/:repo/rawpath` enforces same-origin `Referer` hotlink protection (`src/worker/routes/ui/raw.ts#handleRawPath`).
- **Fix:** Embed repository images only from pages served by the same Gitra host, or use `GET /:owner/:repo/raw?oid=<sha>` for direct plain-text raw access.

### `413` or `400 unsupported-format` when uploading Logo / Favicon / OG Image

- **Cause:** Uploaded image exceeded the slot limit (`512 KiB` for `logo` and `favicon`, `2 MiB` for `og-image`) or failed magic-byte validation (`src/shared/branding.ts`, `src/worker/routes/systemAdmin.ts`).
- **Fix:** Compress the image under the slot size limit and use a supported raster/icon format.

---

## Cloudflare Deployment Errors

### R2 bucket creation fails (`Please enable R2 through the Cloudflare Dashboard`)

- **Cause:** R2 has not been activated once on your Cloudflare account.
- **Fix:** Open the Cloudflare Dashboard → **Storage & Databases → R2** and enable R2 (includes a permanent free allowance), then re-run `npm run cf:auto-deploy`.

### Cloudflare Free Tier CPU Limit Exceeded (`1102`)

- **Cause:** Pushing very large packfiles or manually triggering heavy pack compaction on a Cloudflare Workers Free plan (10ms CPU time per invocation).
- **Fix:**
  1. Ensure `CLOUDFLARE_TIER=free` is set so automatic background compaction is skipped (`src/worker/common/tier.ts`).
  2. Push smaller, incremental commits rather than massive binary history imports on the Free plan.
  3. Upgrade to **Cloudflare Workers Paid** (`npm run cf:auto-deploy:paid`) for higher CPU limits (`cpu_ms: 300000`) and Queue-backed asynchronous compaction.

### `cf:auto-deploy` fails with `Multiple Cloudflare accounts found`

- **Cause:** Your API token has access to more than one Cloudflare account and `CLOUDFLARE_ACCOUNT_ID` is unset (`scripts/cf-auto-deploy.mjs`).
- **Fix:** Set `CLOUDFLARE_ACCOUNT_ID=<your-account-id>` in `.env.deploy` or your CI environment.
