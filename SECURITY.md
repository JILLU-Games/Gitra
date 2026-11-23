# Security Policy (`git-on-cloudflare`)

**Vib Tools** ([https://vibtools.io/](https://vibtools.io/)) takes the security of `git-on-cloudflare` and all public Vib Tools projects seriously. This document outlines how to report a security vulnerability privately and summarizes the security controls built into this repository.

---

## Reporting a Vulnerability (Private Disclosure)

> **Important:** Please **do not** report sensitive security vulnerabilities through public GitHub issues, discussions, or pull requests.

If you discover a security issue in `git-on-cloudflare` (such as an authentication bypass, cross-namespace access leak, remote code execution, cross-site scripting, or CSRF vulnerability), please report it privately to Vib Tools support:

- **Security & Support Email:** [support@vibtools.io](mailto:support@vibtools.io)
- **General Company Contact:** [hello@vibtools.io](mailto:hello@vibtools.io)
- **Urgent Contact / WhatsApp (GMT+6):** `+880 1795-470603`

### What to Include in Your Report

To help us triage and reproduce the issue quickly, please include:

1. **Affected Component / Route:** (e.g., `src/worker/routes/git.ts`, `src/worker/auth/session.ts`, `/:owner/:repo/rawpath`).
2. **Reproduction Steps:** Minimal proof-of-concept request, `curl` command, or test case demonstrating the issue.
3. **Impact Assessment:** What an attacker could read, modify, or disrupt.
4. **Environment Details:** Local development (`vite dev`), Cloudflare Workers deployment, or specific browser configuration.

We will acknowledge receipt of your report, investigate the finding, and coordinate a fix before public disclosure.

---

## Built-In Security Architecture

`git-on-cloudflare` implements defense-in-depth across its Worker routes, authentication layer, and SSR UI:

### 1. Password & Token Cryptography

- **Password Hashing (`src/worker/auth/passwords.ts`):** User passwords are hashed using **`PBKDF2-SHA256`** with unique per-user random salts and timing-safe verification. Plaintext passwords are never stored in D1 or logged.
- **Personal Access Tokens (`src/worker/auth/pat.ts`):** Git PATs (`goc_<id>_<secret>`) are shown once at creation time and stored exclusively as **`SHA-256` digests** in Cloudflare D1.
- **Session Cookie Sealing (`src/worker/auth/session.ts`):** Browser session tokens are signed with **`HMAC-SHA256`** using `SESSION_SECRET` and issued with `HttpOnly; Secure; Partitioned; SameSite=None` attributes.

### 2. Role-Based Access Control (RBAC) & Non-Disclosure

- **3-Tier Directory Roles:** Users are assigned `admin`, `member`, or `viewer` roles enforced server-side on every mutation and UI route (`src/shared/admin/panel.ts`).
- **Immediate Revocation:** Disabling or deleting a user in `/admin/users` immediately invalidates active browser sessions and blocks PAT authentication on subsequent requests.
- **Private Repository Non-Disclosure:** Unauthorized requests to private repositories return `404 Not Found` on web UI routes (and `401`/`404` on Git Smart HTTP routes depending on credential state) so private repository existence is not disclosed to anonymous scanners.
- **Strict Repo Admin UI Gating:** The repository `Settings` (`/:owner/:repo/admin`) tab and endpoint are gated by `canViewerManageRepo`, ensuring anonymous visitors and read-only viewers cannot see or access repository administration controls.
- **Primary Admin Protection:** The primary `@admin` account cannot be disabled, demoted, or deleted through `/admin/api/users`.

### 3. CSRF, Content Sanitization & Raw Asset Protection

- **Same-Origin CSRF Guard (`src/worker/auth/origin.ts`):** All state-changing `POST`, `PUT`, `PATCH`, and `DELETE` endpoints verify same-origin headers before executing D1 or Durable Object mutations.
- **Markdown & Diff XSS Sanitization (`src/client/server/markdown.ts`):** Rendered Markdown (`README.md`, `.vibtools/profile/README.md`) is sanitized server-side and client-side to strip `<script>`, unsafe event handlers (`onerror`, `onload`), and `javascript:` URIs.
- **Global Escaped Error Fallback (`src/client/server/error.ts`):** Unhandled SSR exceptions fall back to `buildEscapedErrorHtmlDocument()`, escaping all dynamic strings to prevent reflected XSS in error pages.
- **Raw Endpoint Hardening (`src/worker/routes/ui/raw.ts`):**
  - `/raw` serves blobs strictly as `text/plain; charset=utf-8` with `X-Content-Type-Options: nosniff`.
  - `/rawpath` enforces a same-origin `Referer` check and returns `403 Forbidden` on cross-site hotlink attempts.
- **Private Cache Isolation:** Authenticated and role-dependent SSR responses invoke `markRequestPrivate(c)` and set `Cache-Control: private, no-store` with `Vary: Cookie, Authorization` to prevent shared edge cache poisoning.

---

## Production Hardening Recommendations

When deploying `git-on-cloudflare` to production on Cloudflare Workers:

1. **Generate a Strong `SESSION_SECRET`:**
   ```bash
   openssl rand -hex 32
   npx wrangler secret put SESSION_SECRET
   ```
2. **Always Set `ADMIN_PASSWORD` in Production:**
   Leaving `ADMIN_PASSWORD` unset enables Local/Preview Demo Mode (`admin123` / `devuser123`). Always set a strong production password via `npx wrangler secret put ADMIN_PASSWORD` to disable demo login endpoints.
3. **Never Commit `.dev.vars` or Secrets:** Keep `.dev.vars` untracked (it is gitignored by default) and store all production credentials in Cloudflare Wrangler Secrets.
