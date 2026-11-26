---
title: Cloudflare Free/Paid Tiers & Zero-Touch Auto-Deploy
description: How Gitra adapts automatically to Cloudflare Free and Paid accounts and provisions infrastructure idempotently without hardcoding IDs.
order: 6
draft: false
---

# Cloudflare Free/Paid Tiers & Zero-Touch Auto-Deploy

Gitra runs cleanly on both **Cloudflare Workers Free** and **Cloudflare Workers Paid** plans without maintaining separate codebases.

---

## Runtime Tier Resolution (`src/worker/common/tier.ts`)

Gitra resolves its operating tier via `resolveCloudflareTier(env)` using the `CLOUDFLARE_TIER` environment variable (defaulting to `"free"` when unset or unrecognized):

| Helper Function                     | Free Tier (`CLOUDFLARE_TIER=free`)      | Paid Tier (`CLOUDFLARE_TIER=paid`)  |
| :---------------------------------- | :-------------------------------------- | :---------------------------------- |
| `resolveCloudflareTier(env)`        | `"free"`                                | `"paid"`                            |
| `isPaidCloudflareTier(env)`         | `false`                                 | `true`                              |
| `hasRepoTaskQueue(env)`             | `false` when `REPO_TASKS_QUEUE` omitted | `true` when Queue binding present   |
| `shouldScheduleAutoCompaction(env)` | `false` (protects 10ms Free CPU budget) | `true` (when Queue binding present) |

### Task Dispatch Strategy (`src/worker/tasks/dispatch.ts`)

- **`dispatchRouteCacheSync`:** Sends to `REPO_TASKS_QUEUE` if bound; otherwise executes `syncRouteCacheRecord()` inline via `ctx.waitUntil`.
- **`dispatchRepositoryDelete`:** Sends to `REPO_TASKS_QUEUE` if bound (returns `{ queued: true }` → HTTP `202`); otherwise executes `executeRepositoryDelete()` directly inline (returns `{ queued: false }` → HTTP `200`).
- **`sendOptionalMaintenanceTask`:** Enqueues `compaction`, `compaction-delete`, or `pack-ref-backfill` messages only when `REPO_TASKS_QUEUE` is bound; safely no-ops and logs otherwise.

---

## Zero-Touch Idempotent Auto-Deploy (`scripts/cf-auto-deploy.mjs`)

Gitra ships a Node.js deployment orchestrator (`scripts/cf-auto-deploy.mjs` + pure helper library `scripts/cf-auto-deploy-lib.mjs`) backed by the Cloudflare REST API and Wrangler CLI.

### Core Guarantees

1. **Clean Version-Controlled Configs:** Tracked `wrangler.jsonc` (Free template) and `wrangler.paid.jsonc` (Paid template) never store production account IDs, D1 UUIDs, KV IDs, R2 bucket names, or custom domains.
2. **Idempotent Resource Provisioning:** On first deploy, the script creates D1 (`CF_D1_NAME`, default `<APP_NAME>`), KV (`CF_KV_TITLE`, default `<APP_NAME>-routes`), R2 (`CF_R2_BUCKET`, default `<APP_NAME>-repos`), and optionally Queue (`CF_QUEUE_NAME`, default `<APP_NAME>-repo-maint`, controlled by `USE_QUEUES`). On every subsequent deploy, it discovers and reuses those exact resources by name.
3. **Zero Credential Drift:** `planSecretReconciliation()` inspects the live Worker's existing secrets first. Required secrets (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) and optional auth secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_MODE`) already present remotely are **preserved untouched** unless `--rotate-secrets` (or `FORCE_ROTATE_SECRETS=true`) is explicitly specified.
4. **Automatic Custom Domain Routing:** Setting `APP_DOMAIN` (or `CUSTOM_DOMAIN` / `--domain`) injects `routes: [{ pattern, custom_domain: true }]` into the ephemeral `.wrangler/deploy.generated.jsonc`, letting Wrangler configure DNS and TLS automatically.

### CLI Flags & Commands

```bash
# Standard Free-tier deploy (Queue-less inline fallback)
npm run cf:auto-deploy -- --free --no-queues

# Paid-tier deploy (sets cpu_ms: 300000 + Cloudflare Queues + auto compaction)
npm run cf:auto-deploy:paid

# Dry run (validates config & shows planned actions without mutating Cloudflare)
npm run cf:auto-deploy -- --dry-run

# Override flags directly on CLI
node scripts/cf-auto-deploy.mjs \
  --paid \
  --name gitra \
  --domain git.example.com \
  --with-queues \
  --rotate-secrets
```

For manual step-by-step setup without the auto-deployer, see `scripts/cloudflare-setup.mjs` (`npm run cf:setup` / `npm run cf:setup:paid`) and [CLOUDFLARE_DEPLOY.md](https://github.com/vibtoolshq/gitra/blob/main/docs/CLOUDFLARE_DEPLOY.md).
