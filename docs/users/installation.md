---
title: Installation & Cloudflare Deployment
description: Deploy Gitra to Cloudflare Workers Free or Paid accounts using the zero-touch idempotent auto-deploy pipeline or GitHub Actions.
order: 2
draft: false
---

# Installation & Cloudflare Deployment

Gitra is designed for **zero-touch, idempotent deployment** to Cloudflare Workers. You do not need to manually edit `wrangler.jsonc`, create D1/KV/R2/Queue resources in the Cloudflare dashboard, or copy resource IDs by hand.

---

## Deployment Options at a Glance

| Method                                                         | Cloudflare Plan | Resource Provisioning                                        | Recommended For                          |
| :------------------------------------------------------------- | :-------------- | :----------------------------------------------------------- | :--------------------------------------- |
| **`npm run cf:auto-deploy`** (`-- --no-queues` or `--paid`)    | Free or Paid    | Fully automatic & idempotent via Cloudflare REST API         | Production deployments & repeat rebuilds |
| **GitHub Actions** (`.github/workflows/deploy-cloudflare.yml`) | Free or Paid    | Manual `workflow_dispatch` calling `npm run cf:auto-deploy`  | One-click CI/CD deployments              |
| **Manual Wrangler (`npm run deploy` / `deploy:paid`)**         | Free or Paid    | Manual / `npm run cf:setup` (`scripts/cloudflare-setup.mjs`) | Custom Wrangler workflows                |

---

## Prerequisites

1. A **Cloudflare account** (Free plan or Workers Paid plan).
2. **R2 enabled once** in your Cloudflare Dashboard (**Storage & Databases → R2 → Enable R2**). R2 provides a permanent free allowance (10 GB storage, 1M Class A ops, 10M Class B ops/month), though Cloudflare requires one-time activation on the account.
3. **Node.js `20+`** (CI uses Node `22`) and **npm**.
4. A **Cloudflare API Token** with permissions listed in `.env.deploy.example`:
   - `Account → Workers Scripts: Edit`
   - `Account → D1: Edit`
   - `Account → Workers KV Storage: Edit`
   - `Account → Workers R2 Storage: Edit`
   - `Account → Account Settings: Read`
   - `Account → Queues: Edit` _(optional when `USE_QUEUES=false`)_
   - `Zone (<your-root-domain>) → DNS: Edit` and `Workers Routes: Edit` _(optional, only when `APP_DOMAIN` is set)_

---

## Zero-Touch Auto-Deploy (Recommended)

### Step 1: Create `.env.deploy`

Copy the tracked template (`.env.deploy` is gitignored and never committed):

```bash
cp .env.deploy.example .env.deploy
```

Edit `.env.deploy` with your Cloudflare API token and desired settings:

```dotenv
# Required: Cloudflare API Token
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

# Optional (auto-detected if token has access to a single account)
# CLOUDFLARE_ACCOUNT_ID=

# Optional custom routing domain in your Cloudflare account (e.g., git.example.com)
# Leave empty to serve on *.workers.dev
APP_DOMAIN=git.example.com

# Plan tier: "free" (default) or "paid" ($5/mo+ with cpu_ms: 300000 & auto compaction)
CLOUDFLARE_TIER=free

# Worker name & deterministic prefix for D1 / KV / R2 / Queue resources
APP_NAME=gitra

# Enable Cloudflare Queues ("true" default; set "false" for Queue-less Free inline fallback)
USE_QUEUES=false

# Optional: Set initial admin credentials (preserved across future redeploys)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-admin-password
```

### Step 2: Run the Auto-Deployer

```bash
# Free tier (Queue-less inline fallback)
npm run cf:auto-deploy -- --free --no-queues

# Paid tier (enables cpu_ms: 300000, Cloudflare Queues & automatic pack compaction)
npm run cf:auto-deploy:paid

# Dry run (validates config & prints planned actions without mutating Cloudflare)
npm run cf:auto-deploy -- --dry-run
```

### What `scripts/cf-auto-deploy.mjs` Does Automatically

1. **Resolves your Cloudflare Account ID** (from `CLOUDFLARE_ACCOUNT_ID` or via Cloudflare API when your token spans one account).
2. **Ensures all required Cloudflare resources exist idempotently**:
   - **D1 Database** (`CF_D1_NAME`, default `<APP_NAME>`)
   - **KV Namespace** (`CF_KV_TITLE`, default `<APP_NAME>-routes`)
   - **R2 Bucket** (`CF_R2_BUCKET`, default `<APP_NAME>-repos`)
   - **Cloudflare Queue** (`CF_QUEUE_NAME`, default `<APP_NAME>-repo-maint`, when `USE_QUEUES=true`)
3. **Generates an ephemeral Wrangler config** at `.wrangler/deploy.generated.jsonc` (gitignored), rebasing paths (`main`, `migrations_dir`, `assets.directory`) so tracked `wrangler.jsonc` and `wrangler.paid.jsonc` remain free of production IDs or domains. On `paid`, it injects `limits: { cpu_ms: 300000 }`.
4. **Applies D1 SQL migrations** (`drizzle/d1/`) remotely against the provisioned D1 database.
5. **Reconciles Worker secrets without breaking existing sessions or credentials (`planSecretReconciliation()` in `scripts/cf-auto-deploy-lib.mjs`)**:
   - Inspects existing remote Worker secrets first.
   - Creates missing required secrets (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) from env or 32-byte hex CSPRNG.
   - Syncs optional auth secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_MODE`) when supplied in env.
   - **Never overwrites** existing remote secrets on rebuild/redeploy unless `--rotate-secrets` or `FORCE_ROTATE_SECRETS=true` is explicitly set.
6. **Builds and deploys the Worker + static assets** via `vite build` and `wrangler deploy`.
7. **Attaches `APP_DOMAIN` / `CUSTOM_DOMAIN`** (if configured) using Wrangler's `routes: [{ pattern, custom_domain: true }]`, automatically provisioning DNS and TLS inside Cloudflare.

---

## Re-Deploying Without Credential Mismatch

Running `npm run cf:auto-deploy` again after pulling updates will:

- Reuse the exact same D1 database, KV namespace, R2 bucket, and Queue by name.
- Keep existing `SESSION_SECRET`, `ADMIN_PASSWORD`, and other deployed secrets untouched so signed-in browser sessions remain valid and credentials never drift.
- Apply any new D1 migrations idempotently.

To intentionally rotate secrets:

```bash
npm run cf:auto-deploy -- --rotate-secrets
```

---

## One-Click CI/CD with GitHub Actions

Gitra includes `.github/workflows/deploy-cloudflare.yml`, triggered manually via **`workflow_dispatch`** (with selectable `tier`: `free` / `paid` and `use_queues`: `"true"` / `"false"` inputs) which executes `npm run cf:auto-deploy`.

Configure these **GitHub Repository Secrets** (**Settings → Secrets and variables → Actions → Secrets**):

- `CLOUDFLARE_API_TOKEN` _(required)_
- `CLOUDFLARE_ACCOUNT_ID` _(optional)_
- `ADMIN_USERNAME` _(optional)_
- `ADMIN_PASSWORD` _(optional — preserved after first deploy)_

Configure optional **GitHub Repository Variables** (**Settings → Secrets and variables → Actions → Variables**):

- `APP_DOMAIN`
- `APP_NAME` _(defaults to `git-on-cloudflare`)_
- `CLOUDFLARE_TIER` (`free` or `paid`)
- `USE_QUEUES` (`true` or `false`)

---

## Free Tier vs Paid Tier Summary

| Capability                                     | Free Tier (`CLOUDFLARE_TIER=free`)                   | Paid Tier (`CLOUDFLARE_TIER=paid`)    |
| :--------------------------------------------- | :--------------------------------------------------- | :------------------------------------ |
| Git clone / fetch / push (Smart HTTP v2)       | Full support                                         | Full support                          |
| Web UI, Code Browser, Commit Diffs, Web Editor | Full support                                         | Full support                          |
| Auth, RBAC, Scoped & Global PATs, Admin Studio | Full support                                         | Full support                          |
| Worker CPU Limit                               | Cloudflare Free 10ms default                         | `limits.cpu_ms = 300000` (5 minutes)  |
| Repository Delete & Route Cache Sync           | Inline via `ctx.waitUntil` (when `USE_QUEUES=false`) | Cloudflare Queue (`REPO_TASKS_QUEUE`) |
| Automatic Post-Push Pack Compaction            | Skipped (protects Free CPU budget)                   | Enabled asynchronously via Queue      |
| Manual Pack Compaction (`/:owner/:repo/admin`) | Available on demand                                  | Available on demand                   |

For deep details on tier internals, see [Cloudflare Tiers & Auto-Deploy](./features/cloudflare-tiers-and-auto-deploy.md) and [CLOUDFLARE_DEPLOY.md](https://github.com/vibtoolshq/gitra/blob/main/docs/CLOUDFLARE_DEPLOY.md).
