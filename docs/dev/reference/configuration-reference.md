---
title: Configuration Reference
description: Exhaustive reference of every runtime environment variable, Worker secret, branding env var, Wrangler binding, and auto-deploy flag in Gitra.
order: 1
draft: false
---

# Configuration Reference

Every configuration key below is verified directly from `wrangler.jsonc`, `wrangler.paid.jsonc`, `.dev.vars.example`, `.env.deploy.example`, `src/worker/auth/adminAuth.ts`, `src/worker/auth/session.ts`, `src/worker/common/tier.ts`, `src/worker/branding.ts`, and `scripts/cf-auto-deploy-lib.mjs`.

---

## 1. Runtime Worker Variables (`wrangler.jsonc` / `.dev.vars`)

| Variable               | Type / Allowed Values                                                | Default                                                       | Source File                                           | Purpose                                                                           |
| :--------------------- | :------------------------------------------------------------------- | :------------------------------------------------------------ | :---------------------------------------------------- | :-------------------------------------------------------------------------------- |
| `CLOUDFLARE_TIER`      | `"free"` \| `"paid"`                                                 | `"free"`                                                      | `src/worker/common/tier.ts`                           | Controls Paid-tier Queue auto-compaction vs Free-tier inline fallback             |
| `AUTH_MODE`            | `"development"` \| `"dev"` \| `"demo"` \| `"production"` \| `"prod"` | `"production"` in `vite build`; `"development"` in `vite dev` | `src/worker/auth/adminAuth.ts`                        | Overrides runtime auth mode deterministically                                     |
| `ADMIN_USERNAME`       | string                                                               | `"admin"`                                                     | `src/worker/auth/adminAuth.ts`                        | Primary administrator login username (lowercased)                                 |
| `ADMIN_NAMESPACE`      | valid slug                                                           | Derived from `ADMIN_USERNAME`                                 | `src/worker/auth/adminAuth.ts`                        | Optional initial public `@namespace` slug for primary admin on first provisioning |
| `REPO_DO_IDLE_MINUTES` | numeric string                                                       | `"30"`                                                        | `wrangler.jsonc`, `src/worker/do/repo/maintenance.ts` | Idle minutes before empty Repo DO cleans itself up                                |
| `LOG_LEVEL`            | `"debug"` \| `"info"` \| `"warn"` \| `"error"`                       | `"info"` (prod) / `"debug"` (`.dev.vars`)                     | `src/worker/common/logger.ts`                         | Structured JSON logger verbosity                                                  |
| `PACK_INDEXER_FIXTURE` | `"1"` \| `""`                                                        | `""`                                                          | `vitest.config.ts`                                    | Opt-in test flag for 42 MiB pack indexer fixture test                             |

---

## 2. Runtime Worker Secrets (Cloudflare Secrets / `.dev.vars`)

| Secret                   |                                  Required in Production?                                  | Source File                      | Purpose                                                                                                        |
| :----------------------- | :---------------------------------------------------------------------------------------: | :------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`         |                          **Yes** (fails closed if missing/empty)                          | `src/worker/auth/session.ts`     | HKDF-SHA256 input key material for AES-256-GCM `__Host-goc_session` cookies; rotating invalidates all sessions |
| `ADMIN_PASSWORD`         | **Yes** for primary admin login (fails closed if missing; never falls back to `admin123`) | `src/worker/auth/adminAuth.ts`   | Password for primary env-backed administrator account                                                          |
| `CREDENTIAL_SECRET`      |                           Auto-provisioned by `cf-auto-deploy`                            | `scripts/cf-auto-deploy-lib.mjs` | Preserved across redeploys by `planSecretReconciliation()`                                                     |
| `ADMIN_BOOTSTRAP_SECRET` |                           Auto-provisioned by `cf-auto-deploy`                            | `scripts/cf-auto-deploy-lib.mjs` | Preserved across redeploys by `planSecretReconciliation()`                                                     |

---

## 3. Optional Branding Environment Variable Defaults (`src/worker/branding.ts`)

All 18 branding env vars are optional fallbacks overridden at runtime by KV key `site:branding:v1` (editable at `/admin/settings`):

| Environment Variable    | Maps to `SiteBrandingConfig` Field |
| :---------------------- | :--------------------------------- |
| `SITE_NAME`             | `siteName`                         |
| `SITE_SHORT_NAME`       | `shortName`                        |
| `SITE_TITLE`            | `siteTitle`                        |
| `SITE_META_TITLE`       | `metaTitle`                        |
| `SITE_META_DESCRIPTION` | `metaDescription`                  |
| `SITE_META_KEYWORDS`    | `metaKeywords`                     |
| `SITE_LOGO_URL`         | `logoUrl`                          |
| `SITE_FAVICON_URL`      | `faviconUrl`                       |
| `SITE_OG_IMAGE_URL`     | `ogImageUrl`                       |
| `SITE_TAGLINE`          | `tagline`                          |
| `SITE_HERO_TITLE`       | `heroTitle`                        |
| `SITE_HERO_DESCRIPTION` | `heroDescription`                  |
| `SITE_WORKSPACE_NAME`   | `workspaceName`                    |
| `SITE_WEBSITE_URL`      | `websiteUrl`                       |
| `SITE_WEBSITE_LABEL`    | `websiteLabel`                     |
| `SITE_DOCS_URL`         | `docsUrl`                          |
| `SITE_SUPPORT_EMAIL`    | `supportEmail`                     |
| `SITE_FOOTER_TEXT`      | `footerText`                       |

---

## 4. Wrangler Resource Bindings (`wrangler.jsonc` & `wrangler.paid.jsonc`)

| Binding Name       | Cloudflare Service                                  | Free Tier (`wrangler.jsonc`) | Paid Tier (`wrangler.paid.jsonc`) | Purpose                                                                |
| :----------------- | :-------------------------------------------------- | :--------------------------: | :-------------------------------: | :--------------------------------------------------------------------- |
| `ASSETS`           | Workers Static Assets (`html_handling: "none"`)     |           Required           |             Required              | Serves Vite-compiled client JS/CSS islands                             |
| `DB`               | Cloudflare D1                                       |           Required           |             Required              | 11 relational tables (users, namespaces, repos, PATs, RBAC)            |
| `ROUTES`           | Cloudflare KV                                       |           Required           |             Required              | Public route cache, branch cache, auth rate limits, `site:branding:v1` |
| `REPO_BUCKET`      | Cloudflare R2                                       |           Required           |             Required              | Git `.pack`, `.idx`, `.refs` files & `site-assets/*`                   |
| `REPO_DO`          | Durable Object (`RepoDurableObject`, SQLite-backed) |           Required           |             Required              | Per-repository refs, `HEAD`, leases, and `pack_catalog`                |
| `REPO_TASKS_QUEUE` | Cloudflare Queues (Producer + Consumer)             |           Omitted            |             Required              | Asynchronous compaction, backfill, route cache sync, and repo deletion |

---

## 5. Zero-Touch Auto-Deploy Configuration (`.env.deploy` & CLI Flags)

Consumed by `scripts/cf-auto-deploy.mjs` and `scripts/cf-auto-deploy-lib.mjs`:

| Env Var (`.env.deploy` / CI)                                    | CLI Flag                        | Default                                    | Purpose                                                                                                                         |
| :-------------------------------------------------------------- | :------------------------------ | :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`                                          | _(env only)_                    | _(required)_                               | Cloudflare API token with Workers, D1, KV, R2 (+ optional Queue/Zone) permissions                                               |
| `CLOUDFLARE_ACCOUNT_ID`                                         | _(env only)_                    | Auto-detected if single account            | Target Cloudflare Account ID                                                                                                    |
| `CLOUDFLARE_TIER`                                               | `--free` / `--paid`             | `"free"`                                   | `"free"` or `"paid"` (also accepts `"pro"` / `"enterprise"` as `"paid"`; injects `limits.cpu_ms = 300000`)                      |
| `APP_NAME`                                                      | `--name <appName>`              | `"git-on-cloudflare"`                      | Worker script name & deterministic resource naming prefix                                                                       |
| `APP_DOMAIN` _(alias `CUSTOM_DOMAIN`)_                          | `--domain <host>`               | _(none)_                                   | Optional Cloudflare custom domain (e.g. `git.vibtools.io`) attached via `routes: [{ pattern, custom_domain: true }]`            |
| `USE_QUEUES`                                                    | `--with-queues` / `--no-queues` | `"true"`                                   | Controls whether `REPO_TASKS_QUEUE` is provisioned and bound; set `"false"` / `--no-queues` for Queue-less Free inline fallback |
| `CF_D1_NAME`                                                    | _(env only)_                    | `<APP_NAME>`                               | Override provisioned D1 database name                                                                                           |
| `CF_KV_TITLE`                                                   | _(env only)_                    | `<APP_NAME>-routes`                        | Override provisioned KV namespace title                                                                                         |
| `CF_R2_BUCKET`                                                  | _(env only)_                    | `<APP_NAME>-repos`                         | Override provisioned R2 bucket name                                                                                             |
| `CF_QUEUE_NAME`                                                 | _(env only)_                    | `<APP_NAME>-repo-maint`                    | Override provisioned Queue name                                                                                                 |
| `SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET` | _(env only)_                    | Auto-generated 32-byte hex on first deploy | Required Worker secrets; preserved remotely on repeat deploys unless rotating                                                   |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_MODE`                 | _(env only)_                    | _(optional)_                               | Optional auth secrets synced only when supplied in env and either missing remotely or rotating                                  |
| `LOG_LEVEL`                                                     | _(env only)_                    | `"info"`                                   | Production Worker log level written to generated Wrangler `vars`                                                                |
| `REPO_DO_IDLE_MINUTES`                                          | _(env only)_                    | `"30"`                                     | Repo DO idle cleanup interval written to generated Wrangler `vars`                                                              |
| `FORCE_ROTATE_SECRETS`                                          | `--rotate-secrets`              | `false`                                    | Explicitly rotate existing remote Worker secrets                                                                                |
| _(CLI only)_                                                    | `--dry-run`                     | `false`                                    | Validate config & print plan without mutating Cloudflare                                                                        |
| _(CLI only)_                                                    | `--env-file <path>`             | `.env.deploy`                              | Custom deploy env file path                                                                                                     |
| _(CLI only)_                                                    | `--help` / `-h`                 | —                                          | Print CLI usage summary                                                                                                         |
