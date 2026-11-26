# Security Policy (Gitra)

**[Vib Tools](https://vib.tools/)** takes the security of **Gitra** ([gitra.co](https://gitra.co/)) and all public Vib Tools repositories seriously. This document explains how to privately report security vulnerabilities and outlines the security controls built into Gitra.

---

## Reporting a Vulnerability (Private Disclosure)

> **Important:** Please **do not** disclose sensitive security vulnerabilities in public GitHub issues, discussions, or pull requests.

If you discover a security vulnerability in Gitra (such as an authentication bypass, cross-namespace privilege escalation, CSRF flaw, XSS, or secret exposure), please report it privately to Vib Tools support:

- **Security & Technical Support Email:** [support@vibtools.io](mailto:support@vibtools.io)
- **General Company Contact:** [hello@vibtools.io](mailto:hello@vibtools.io)
- **Direct Phone / WhatsApp (GMT+6 / Asia-Dhaka):** `+880 1795-470603`

### What to Include in Your Report

1. **Affected Component or Route:** e.g., `src/worker/routes/git.ts`, `src/worker/auth/session.ts`, `/admin/api/settings/assets/:slot`, or `/:owner/:repo/rawpath`.
2. **Reproduction Steps:** Minimal proof-of-concept request, `curl` snippet, or test case.
3. **Impact Assessment:** What data or operations could be accessed or modified.
4. **Environment Details:** Local dev (`npm run dev`), Cloudflare Workers Free/Paid deployment, or browser details.

We will acknowledge your report, investigate promptly, and coordinate remediation before public disclosure.

---

## Built-In Security Architecture

Gitra applies defense-in-depth across its Cloudflare Worker runtime, authentication layer, storage bindings, and SSR UI:

### 1. Password, Token & Session Cryptography

- **Password Hashing (`src/worker/auth/passwords.ts`):** Passwords are hashed using **`PBKDF2-SHA256`** with unique per-user random salts and timing-safe verification. Plaintext passwords are never persisted or logged.
- **Personal Access Tokens (`src/worker/auth/pat.ts`):** Git PATs (`goc_<id>_<secret>`) are revealed once at creation time and stored exclusively as **`SHA-256` digests** in Cloudflare D1.
- **Global Admin PAT Live Verification:** All-Namespaces Global PATs (`pat_global_grants`) re-verify on every Git request that the owning account is currently `status = "active"` and `role = "admin"`, immediately blocking demoted or disabled admins.
- **Session Cookie Sealing (`src/worker/auth/session.ts`):** Browser sessions are signed with **`HMAC-SHA256`** using `SESSION_SECRET` and issued with `HttpOnly; Secure; Partitioned; SameSite=None` attributes.

### 2. RBAC, Non-Disclosure & CSRF Protection

- **3-Tier Directory RBAC (`admin`, `member`, `viewer`):** Enforced server-side on every mutation and UI route (`src/shared/admin/panel.ts`).
- **Immediate Revocation:** Disabling or deleting an account in `/admin/users` immediately invalidates active sessions and PATs.
- **Private Repository Non-Disclosure:** Unauthorized requests to private repositories return `404 Not Found` on web routes (and `401`/`404` on Git Smart HTTP routes) to prevent repository enumeration.
- **Same-Origin CSRF Guard (`src/worker/auth/origin.ts`):** State-changing `POST`, `PUT`, `PATCH`, and `DELETE` endpoints validate origin headers (including reverse-proxy `X-Forwarded-Host` / `X-Forwarded-Proto` support) before executing mutations.
- **Primary Admin Safeguards:** The primary `@admin` account cannot be disabled, demoted, or deleted via `/admin/api/users`.

### 3. Content, Asset & Deployment Hardening

- **Markdown & Error Page XSS Defense:** Rendered Markdown (`README.md`, `.vibtools/profile/README.md`) is sanitized to strip unsafe scripts/handlers; unhandled SSR exceptions fall back to `buildEscapedErrorHtmlDocument()`.
- **Branding Asset Upload Validation (`src/shared/branding.ts`):** Custom Logo, Favicon, and OpenGraph image uploads verify binary magic signatures, allowed MIME types (`PNG`, `JPEG`, `WebP`, `ICO`), and strict byte size caps before writing to R2.
- **Raw Endpoint Protection (`src/worker/routes/ui/raw.ts`):** `/raw` enforces `text/plain; charset=utf-8` with `X-Content-Type-Options: nosniff`; `/rawpath` enforces same-origin `Referer` validation (`403 Forbidden` on external hotlinks).
- **Private Cache Isolation:** Authenticated and role-sensitive responses call `markRequestPrivate(c)` and emit `Cache-Control: private, no-store` with `Vary: Cookie, Authorization`.
- **Non-Destructive Secret Management (`scripts/cf-auto-deploy.mjs`):** Zero-touch deployments keep committed `wrangler.jsonc` clean of secrets/IDs, ignore `.env.deploy` in `.gitignore`, and never overwrite existing remote Worker secrets on rebuild unless `FORCE_ROTATE_SECRETS=true` is explicitly enabled.

---

## Production Hardening Checklist

1. **Always Set `ADMIN_PASSWORD` in Production:** Leaving `ADMIN_PASSWORD` unset enables Local Demo Mode. Set a strong admin password via `.env.deploy` or `npx wrangler secret put ADMIN_PASSWORD`.
2. **Use Scoped Cloudflare API Tokens:** Grant your deployment token only the minimum required account/zone scopes listed in [`docs/CLOUDFLARE_DEPLOY.md`](./docs/CLOUDFLARE_DEPLOY.md).
3. **Never Commit Secret Files:** Keep `.dev.vars` and `.env.deploy` untracked (both are ignored in `.gitignore`).
