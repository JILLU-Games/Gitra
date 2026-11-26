---
title: Frequently Asked Questions (FAQ)
description: Answers to common questions about Gitra's Cloudflare compatibility, Git protocol support, authentication, and limitations.
order: 7
draft: false
---

# Frequently Asked Questions (FAQ)

### Can Gitra run on a Cloudflare Free account?

**Yes.** Gitra explicitly supports Cloudflare Free accounts (`CLOUDFLARE_TIER=free`, the default in `wrangler.jsonc` and `.env.deploy.example`). On the Free tier, Gitra omits Cloudflare Queues (which require a Paid plan), runs `route-cache-sync` and `repository-delete` inline via `ctx.waitUntil`, and skips automatic post-push pack compaction to respect the 10ms Free CPU limit (`src/worker/common/tier.ts`, `src/worker/tasks/dispatch.ts`). Note that R2 must be enabled once in the Cloudflare Dashboard (R2 includes a free monthly allowance).

### What do I gain by upgrading to Cloudflare Workers Paid (`CLOUDFLARE_TIER=paid`)?

With `CLOUDFLARE_TIER=paid`, Gitra provisions and binds a Cloudflare Queue (`REPO_TASKS_QUEUE`), enables automatic asynchronous pack compaction and `.refs` sidecar backfill, runs repository deletion reliably with queue retries, and benefits from the higher Workers Paid CPU limits for large pushes and clones.

### Does Gitra support SSH (`git@domain:owner/repo.git`)?

**No.** Cloudflare Workers operate over HTTP/HTTPS, so Gitra implements **Git Smart HTTP v2** over HTTPS only. Authentication uses HTTP Basic with a scoped or global Personal Access Token (`goc_...`).

### Can I use my web login password for `git push` or private `git clone`?

**No.** Web login passwords (env `ADMIN_PASSWORD` or D1 PBKDF2 directory passwords) are strictly for browser sessions. Git CLI access requires a **Personal Access Token (PAT)** minted in `/user/settings/tokens` (`src/worker/routes/git.ts`, `src/worker/auth/pat.ts`).

### Why do some internal filenames, cookies, or the Git agent still say `git-on-cloudflare` or `goc_`?

Gitra evolved from `git-on-cloudflare`. To preserve 100% compatibility with existing sessions, PATs (`goc_...`), D1 schemas, and Wrangler configs, internal identifiers such as `package.json#name`, `__Host-goc_session`, `goc_` PAT prefixes, and `agent=git-on-cloudflare/0.1` remain unchanged while all user-facing branding defaults to **Gitra** (and is fully customizable in `/admin/settings`).

### Does Gitra support Pull Requests, Issues, or Git LFS?

**No.** Based on the audited codebase, Gitra focuses on fast, lean Git repository hosting, code browsing, commit/diff inspection, web file editing, namespace profiles, RBAC user directory, PAT management, and site branding. Pull Requests, Issues, CI runners, webhooks, and Git LFS are not implemented.

### Does Gitra still use Tessera OIDC?

**No.** While historical migration notes (`docs/tessera-ownership-migration-plan.md`), the D1 column `users.tessera_sub`, and an unused `openid-client` package remain in the repository, live authentication uses local administrator credentials + D1 PBKDF2 directory passwords and AES-256-GCM sealed browser session cookies (`src/worker/auth/adminAuth.ts`, `src/worker/auth/passwords.ts`, `src/worker/auth/session.ts`).

### How do I customize the logo, favicon, site title, and SEO settings?

Sign in as an active `admin` and open **`/admin/settings`**. You can edit the site name, tagline, hero copy, meta tags, social links, `robots.txt` indexing toggle, and upload custom `logo`, `favicon`, and `og-image` files directly to R2 without redeploying.

### Will running `npm run cf:auto-deploy` again overwrite my admin password or log everyone out?

**No.** `scripts/cf-auto-deploy.mjs` inspects the live Worker's existing secrets first and preserves `SESSION_SECRET`, `ADMIN_PASSWORD`, and other deployed secrets across every rebuild/redeploy unless you explicitly pass `--rotate-secrets` (or `FORCE_ROTATE_SECRETS=true`).

### Why is the `@admin` profile at `/profile/admin` instead of `/admin`?

Because `/admin` is reserved for the **Site Administration Control Panel** (`src/worker/routes/systemAdmin.ts`). All other namespaces use `/:owner`, while `@admin`'s public profile lives at `/profile/admin` (`src/shared/admin/panel.ts#buildNamespaceProfileHref`).
