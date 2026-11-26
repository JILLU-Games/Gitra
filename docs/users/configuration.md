---
title: Configuration Guide
description: Configure Gitra runtime environment variables, Worker secrets, authentication modes, and live branding/SEO settings.
order: 3
draft: false
---

# Configuration Guide

Gitra separates configuration into three layers:

1. **Runtime Environment Variables & Secrets** — control tier behavior, logging, authentication mode, and cryptographic keys (`.dev.vars` locally, Worker vars/secrets in Cloudflare).
2. **Deploy-Time Configuration** — control resource naming, custom domain, and auto-deploy behavior (`.env.deploy` or CI environment variables).
3. **Live Instance Settings (`/admin/settings`)** — customize branding, SEO metadata, uploaded logos/favicons/OG images, and `robots.txt` indexing at runtime without redeploying.

For the exhaustive key-by-key reference of every variable and default value, see the [Configuration Reference](https://developer.vibtools.io/gitra/reference/configuration-reference/).

---

## 1. Local Development Configuration (`.dev.vars`)

Copy `.dev.vars.example` to `.dev.vars` to customize local development behavior:

```bash
cp .dev.vars.example .dev.vars
```

Key local settings (`src/worker/auth/adminAuth.ts`, `src/worker/common/tier.ts`):

| Variable               | Default in `.dev.vars.example`       | Purpose                                                                                                                      |
| :--------------------- | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_TIER`      | `free`                               | `free` skips automatic background compaction; `paid` enables queue-backed compaction.                                        |
| `AUTH_MODE`            | `development`                        | `development` enables Demo Mode when `ADMIN_PASSWORD` is empty; `production` enforces strict production auth.                |
| `ADMIN_USERNAME`       | `admin`                              | Primary administrator login username.                                                                                        |
| `ADMIN_PASSWORD`       | _(empty)_                            | Leave empty locally for Demo Mode; set a password to disable Demo Mode locally.                                              |
| `ADMIN_NAMESPACE`      | _(commented)_                        | Optional initial public Git `@namespace` handle for the primary admin (decouples public handle from private login username). |
| `SESSION_SECRET`       | `local-goc-session-secret-change-me` | Secret used to derive the AES-256-GCM cookie sealing key via HKDF-SHA256.                                                    |
| `REPO_DO_IDLE_MINUTES` | `30`                                 | Minutes before an empty idle Repository Durable Object cleans itself up.                                                     |
| `LOG_LEVEL`            | `debug`                              | Structured JSON log threshold: `debug`, `info`, `warn`, or `error`.                                                          |

---

## 2. Production Secrets & Runtime Modes

In production builds (`vite build` / `npm run build`), `import.meta.env.PROD` is `true`, which automatically puts Gitra into **Production Mode** (`src/worker/auth/adminAuth.ts`, `src/worker/auth/session.ts`):

- **`SESSION_SECRET` is strictly required.** If missing or empty in Production Mode, session creation and validation fail closed (no ephemeral fallback key is generated).
- **`ADMIN_PASSWORD` never falls back to `admin123`.** If `ADMIN_PASSWORD` is unset, primary admin password login fails closed while existing D1 directory users with PBKDF2 passwords can still sign in.
- **Demo Mode is completely disabled.** `/auth/demo-login` returns `404`, demo buttons are hidden, and automatic demo repository seeding is skipped.

### Decoupling Primary Admin Login from Public `@namespace`

To keep your primary administrator login username private while exposing a clean public organization handle (for example, `@vibtools`):

- Set `ADMIN_USERNAME` to a private login name (e.g., `ops-root`).
- Set `ADMIN_NAMESPACE` to your desired public namespace slug (e.g., `vibtools`).

On first sign-in, Gitra provisions the primary admin's public namespace as `ADMIN_NAMESPACE`. Once created in D1, D1 remains canonical and the primary admin can rename their public handle later in **`/admin/users`** without changing `ADMIN_USERNAME` (`src/worker/auth/adminAuth.ts#resolveInitialAdminNamespaceSlug`).

---

## 3. Live Branding, SEO & Assets (`/admin/settings`)

Active `admin` users can configure site-wide appearance and search engine settings live at **`/admin/settings`** (also aliased from `/admin/SettingsControlPanel`).

### Precedence Order (`src/worker/branding.ts#loadSiteBranding`)

1. **KV Live Overrides** (`ROUTES` KV key `site:branding:v1`) — highest priority, updated immediately via `PUT /admin/api/settings`.
2. **Environment Variable Defaults** (`SITE_NAME`, `SITE_TITLE`, `SITE_META_DESCRIPTION`, etc.) — used when a KV override is not set.
3. **Built-In Defaults** (`src/shared/branding.ts#DEFAULT_SITE_BRANDING`).

### Configurable Branding & SEO Fields

- **Identity:** `siteName`, `shortName`, `siteTitle`, `tagline`, `workspaceName`, `footerText`
- **Homepage Hero:** `heroTitle`, `heroDescription`
- **SEO & Social Meta:** `metaTitle`, `metaDescription`, `metaKeywords`, `allowIndexing` (dynamically updates `GET /robots.txt` and `<meta name="robots">`)
- **Links & Contact:** `websiteUrl`, `websiteLabel`, `docsUrl`, `supportEmail`
- **Brand Assets (URL or R2 Upload):** `logoUrl`, `faviconUrl`, `ogImageUrl`

### Uploading Custom Brand Assets

In `/admin/settings`, admins can upload image files directly to R2 (`site-assets/<slot>` via `POST /admin/api/settings/asset/:slot`):

| Slot       | Max File Size | Validation                                                              | Served At                                          |
| :--------- | :------------ | :---------------------------------------------------------------------- | :------------------------------------------------- |
| `logo`     | 512 KiB       | Magic-byte check: **PNG, JPEG, WebP** (ICO, GIF, and SVG/HTML rejected) | `/api/site-assets/logo?v=<ts>`                     |
| `favicon`  | 512 KiB       | Magic-byte check: **PNG, JPEG, WebP, ICO** (`image/x-icon`)             | `/api/site-assets/favicon?v=<ts>` & `/favicon.ico` |
| `og-image` | 2 MiB         | Magic-byte check: **PNG, JPEG, WebP** (ICO, GIF, and SVG/HTML rejected) | `/api/site-assets/og-image?v=<ts>`                 |

Uploading an asset automatically updates the corresponding URL field in KV (`site:branding:v1`). Deleting an asset via `DELETE /admin/api/settings/asset/:slot` removes it from R2 and clears the URL field.
