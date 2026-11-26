---
title: Security Architecture
description: Cryptographic primitives, session sealing, RBAC enforcement, PAT verification, CSRF protection, rate limiting, and content security in Gitra.
order: 6
draft: false
---

# Security Architecture

This document audits every security control implemented across `src/worker/auth/`, `src/worker/routes/`, `src/worker/cache/policy.ts`, and `src/shared/`.

---

## 1. Cryptographic Primitives (Web Crypto API)

| Primitive                          | Implementation                 | Parameters & Storage                                                                                                                                                                                                                            |
| :--------------------------------- | :----------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Directory Password Hashing**     | `src/worker/auth/passwords.ts` | `PBKDF2-SHA256`, `100,000` iterations, 16-byte CSPRNG salt, 256-bit derived key. Stored as `pbkdf2_sha256$<iter>$<b64url-salt>$<b64url-key>`. Verified in constant time.                                                                        |
| **Browser Session Sealing**        | `src/worker/auth/session.ts`   | Key derived from `SESSION_SECRET` via `HKDF-SHA256` (`info: "goc-browser-session-v1"`), encrypted with `AES-256-GCM` and a fresh 12-byte IV per cookie. Wire format: `goc_sess_<base64url(iv \|\| ciphertext)>`. 30-day TTL (`SESSION_TTL_MS`). |
| **Personal Access Tokens**         | `src/worker/auth/pat.ts`       | Public prefix `goc_<8-hex>` + 32-char lowercase base32 secret (`160` bits entropy). Full plaintext hashed with `SHA-256`; verified via `crypto.subtle.timingSafeEqual` (with XOR fallback).                                                     |
| **Primary Admin Credential Check** | `src/worker/auth/adminAuth.ts` | `constantTimeEqual()` compares SHA-256 digests of both username and password so timing does not leak length or prefix matches.                                                                                                                  |
| **Temporary Passwords**            | `src/shared/admin/panel.ts`    | `generateTemporaryPassword()` uses `crypto.getRandomValues` + Fisher-Yates shuffle across uppercase, lowercase, digits, and symbols (default 16 chars; allowed policy 8–128 chars).                                                             |

---

## 2. Cookie & Session Hardening (`src/worker/auth/cookies.ts`, `session.ts`)

- **Cookie Name:** `__Host-goc_session` (uses Hono's `prefix: "host"` enforcing `Secure`, `Path=/`, and no `Domain`).
- **Attributes:** `HttpOnly; Secure; SameSite=None; Partitioned` (CHIPS) with `Max-Age=2592000` (30 days), enabling secure iframe preview compatibility while partitioning cookie jars per top-level site.
- **Live Revocation & Fail-Closed Design:**
  - Every `readActiveSession()` looks up `users.id` in D1 so deleted users fail closed.
  - Every `loadViewer()` queries live `namespace_directory_meta`; if `status === "disabled"`, the session immediately resolves to `null`. If D1 metadata lookup fails, `loadViewer()` fails closed (`null`) rather than falling back to a writable role.
  - Because cookies are stateless sealed tokens, rotating `SESSION_SECRET` immediately invalidates all active browser sessions.
  - In Production Mode (`import.meta.env.PROD === true` or `AUTH_MODE=production`), a missing `SESSION_SECRET` or `ADMIN_PASSWORD` **never** falls back to ephemeral keys or demo passwords (`admin123`).

---

## 3. CSRF Protection (`src/worker/auth/origin.ts`)

Every non-safe HTTP method (`POST`, `PUT`, `PATCH`, `DELETE`) on cookie-authenticated routes (login, sign-out, profile, repositories, PATs, repo admin, and site admin) invokes `sameOriginViolation(c)`:

- Safe methods (`GET`, `HEAD`, `OPTIONS`) pass through.
- Non-safe methods must supply a valid `http:` or `https:` `Origin` header matching:
  1. Exact `requestUrl.origin`, OR
  2. Reverse-proxied host via `X-Forwarded-Host`, `Forwarded`, or `Host` (allowing HTTPS `Origin` when TLS terminates upstream, while rejecting HTTP downgrades), OR
  3. On loopback reverse proxies (`localhost`/`127.0.0.1`/`::1`), `Sec-Fetch-Site: same-origin` + `https:` `Origin` (and matching `Referer` origin if present).
- Violations are logged (`csrf:same-origin-rejected`) and rejected with **`403 Forbidden`**.

---

## 4. Rate Limiting (`src/worker/auth/rateLimit.ts`)

- Protects `POST /auth/login` (`scope: "login"`) and `POST /auth/api/change-password` (`scope: "change-password"`).
- Stored in `ROUTES` KV under `auth-rl:<scope>:<clientIp>:<target>` using `CF-Connecting-IP` (fallback `X-Forwarded-For`).
- Threshold: **8 failed attempts per 300-second (5-minute) window**. Exceeding the limit returns `429 Too Many Requests` with `Retry-After`. Successful authentication clears the key.

---

## 5. Authorization & Non-Disclosure Boundaries

- **Private Repository Non-Disclosure:** Unauthenticated Git reads (`git-upload-pack`) and Web UI visits to private repositories return **`404 Not Found`** instead of `403`, preventing repository existence enumeration. Private repos are also omitted from the `ROUTES` KV public route cache.
- **Private Cache Bypass (`src/worker/cache/policy.ts`):** Private repository routes and `git-receive-pack` call `markRequestPrivate(cacheCtx)`, preventing any Workers Cache API read or write and emitting `Cache-Control: no-store`.
- **Live PAT Role Enforcement (`src/worker/auth/pat.ts#resolvePatOwnerPolicy`):**
  - Disabled users' PATs immediately return `token-revoked` (`401`).
  - Users demoted to `viewer` have all repo/namespace PATs dynamically capped to `pull` (`push` returns `403`).
  - Global Admin PATs (`pat_global_grants`) re-check `canIssueGlobalPat(role, status)` on every Git request; demoted/disabled admins immediately receive `grant-missing` (`403`).
- **Admin Isolation:** Repo Admin (`/:owner/:repo/admin/*`) and Site Admin (`/admin/*`) strictly ignore HTTP Basic Git PAT credentials and require a browser session.
- **Open Redirect Prevention (`src/worker/auth/adminAuth.ts#sanitizeNextRedirect`):** `?next=` targets must start with a single `/`, contain no `//`, `\`, or control characters, and cannot loop back to `/auth`.

---

## 6. Content, Asset & Raw File Hardening

- **`GET /:owner/:repo/raw` (`src/worker/routes/ui/raw.ts`):** Always serves `Content-Type: text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, and sanitized `Content-Disposition` filenames (stripping path separators, control chars, quotes, and semicolons).
- **`GET /:owner/:repo/rawpath`:** Requires a same-origin `Referer` header (`403 Hotlinking not allowed` otherwise), adds `CSP: sandbox` + `nosniff`, and downgrades scriptable types (`svg`, `html`, `xml`, `javascript`) to `text/plain` with `Content-Disposition: attachment`.
- **Site Branding Asset Uploads (`src/shared/branding.ts#validateBrandingAssetBytes`):** Validates actual file **magic bytes** (PNG, JPEG, WebP; ICO only for `favicon`), enforces hard byte caps (`512 KiB` / `2 MiB`), and intentionally rejects SVG/HTML uploads to eliminate stored XSS on `/api/site-assets/:slot`.
- **Profile & Branding URL Sanitization:** Rejects `javascript:`, `data:`, `vbscript:`, `file:`, `mailto:`, and `tel:` schemes on website/branding URL inputs.
