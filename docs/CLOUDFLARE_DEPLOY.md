# Deploying Gitra to Cloudflare (Free & Paid Plans)

**Gitra** ([gitra.co](https://gitra.co/)) supports **100% automated, environment-driven deployments** on both **Cloudflare Workers Free Plan ($0/mo)** and **Cloudflare Workers Paid Plan ($5/mo+)**.

- **Clean `wrangler.jsonc`:** Never commit production domains, D1 database UUIDs, KV namespace IDs, or bucket names. Everything is resolved dynamically into a git-ignored ephemeral config (`.wrangler/deploy.generated.jsonc`).
- **First Install = Full Auto-Provisioning:** Creates D1, KV, R2, and optional Queue automatically, applies remote D1 SQL migrations, binds `APP_DOMAIN` (e.g., `gitra.co`) as a Cloudflare Custom Domain (auto DNS + TLS), and seeds required secrets once.
- **Unlimited Redeploys = Zero Credential Mismatch:** Reuses all existing Cloudflare resource IDs and **never overwrites existing Worker secrets** (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) unless you explicitly pass `FORCE_ROTATE_SECRETS=true`.

---

## 1-Time Cloudflare Account Prerequisites

1. **Enable R2 once** in Cloudflare Dashboard → **R2 Object Storage** → **Enable R2** (10 GB/month + zero egress free).
2. **Create a Cloudflare API Token** (Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token) with:
   - Account → **Workers Scripts**: Edit
   - Account → **D1**: Edit
   - Account → **Workers KV Storage**: Edit
   - Account → **Workers R2 Storage**: Edit
   - Account → **Queues**: Edit _(optional when `USE_QUEUES=false`)_
   - Account → **Account Settings**: Read
   - Zone (`<your-domain>`) → **DNS**: Edit, **Workers Routes**: Edit _(only needed if setting `APP_DOMAIN`)_

---

## Quick Start (Zero-Touch Local Deploy)

1. Copy `.env.deploy.example` to `.env.deploy` (git-ignored) and configure your token and optional custom domain:

   ```dotenv
   CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
   APP_DOMAIN=gitra.co
   APP_NAME=gitra
   CLOUDFLARE_TIER=free
   USE_QUEUES=true
   ```

2. _(Optional)_ Preview all planned API checks, generated config, and secret actions without modifying Cloudflare:

   ```bash
   npm run cf:auto-deploy -- --dry-run
   ```

3. Run first install or any future rebuild/redeploy:

   ```bash
   # Free Plan (default)
   npm run cf:auto-deploy

   # Free Plan without Queues (automatic inline fallback)
   npm run cf:auto-deploy -- --no-queues

   # Paid Plan ($5/mo+ — unlocks cpu_ms: 300000 & automatic background compaction)
   npm run cf:auto-deploy:paid
   ```

---

## GitHub Actions Auto-Deploy

Gitra includes a ready-to-use workflow at `.github/workflows/deploy-cloudflare.yml`. Configure these in **Settings → Secrets and variables → Actions**:

- **Secrets:** `CLOUDFLARE_API_TOKEN` _(and optionally `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`)_
- **Variables:** `APP_DOMAIN` _(e.g., `gitra.co`)_, `APP_NAME` _(e.g., `gitra`)_, `CLOUDFLARE_TIER` (`free` or `paid`), `USE_QUEUES` (`true` or `false`)

Trigger **Deploy to Cloudflare** from the GitHub Actions tab to provision on first run and redeploy cleanly with zero credential mismatch.

---

## Free vs Paid Plan Comparison

| Feature                                  | Free (`CLOUDFLARE_TIER=free`)                                      | Paid (`CLOUDFLARE_TIER=paid`)                 |
| :--------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------- |
| **CPU Limit**                            | Free 10ms (`limits` omitted)                                       | `300000` ms (5 minutes)                       |
| **SQLite Durable Objects, D1, KV, R2**   | Included on Free quotas                                            | Included                                      |
| **Cloudflare Queues**                    | Optional (Free 10k ops/day, or `USE_QUEUES=false` inline fallback) | Enabled                                       |
| **Automatic Background Pack Compaction** | Skipped automatically (prevents 10ms CPU errors on push)           | Enabled automatically                         |
| **Routing**                              | `APP_DOMAIN` custom domain or `*.workers.dev`                      | `APP_DOMAIN` custom domain or `*.workers.dev` |

---

Maintained by **[Vib Tools](https://vib.tools/)** · Support: [support@vibtools.io](mailto:support@vibtools.io)
