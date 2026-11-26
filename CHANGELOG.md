# Changelog

All notable changes to **Gitra** ([gitra.co](https://gitra.co/)) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.2.0] — 2026-11-26

### Added

- **Zero-Touch, Idempotent Cloudflare Auto-Deploy (`npm run cf:auto-deploy`):**
  - Added `scripts/cf-auto-deploy.mjs` and pure tested helpers (`scripts/cf-auto-deploy-lib.mjs`) authenticated strictly via `CLOUDFLARE_API_TOKEN` with automatic Account ID detection.
  - Automatically discovers or provisions D1, KV, R2, and optional Queues by deterministic resource names, generates an ephemeral git-ignored Wrangler config under `.wrangler/`, applies remote D1 migrations, builds Vite assets, deploys the Worker, and binds `APP_DOMAIN` (`custom_domain: true`).
  - Added non-destructive Worker secret reconciliation so existing remote secrets (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) are preserved across unlimited rebuilds/redeploys without credential mismatch.
  - Sanitized committed `wrangler.jsonc` and `wrangler.paid.jsonc` into clean account-agnostic templates with zero hardcoded production IDs or domains.
  - Added `.env.deploy.example`, GitHub Actions auto-deploy workflow (`.github/workflows/deploy-cloudflare.yml`), and `test/cf-auto-deploy.node-test.ts`.
- **Cloudflare Free & Paid Plan Support (`CLOUDFLARE_TIER`):**
  - Made the default deployment Cloudflare Workers Free Plan compatible (`CLOUDFLARE_TIER=free`, omitted Paid-only `limits.cpu_ms`, `workers_dev: true`, automatic Free-tier compaction deferral via `src/worker/common/tier.ts`).
  - Added Paid Plan support (`wrangler.paid.jsonc`, `CLOUDFLARE_TIER=paid`, `limits.cpu_ms: 300000`, full automatic background compaction).
  - Added `src/worker/tasks/dispatch.ts` with automatic inline fallback for `route-cache-sync` and `repository-delete` when running without Cloudflare Queues (`USE_QUEUES=false` / `--no-queues`).
  - Added `test/cloudflare-tier.node-test.ts`.
- **Site Branding, SEO Meta & Asset Studio (`/admin/settings`):**
  - Added full live configuration of Site Name, Short Name, Site Title, Meta Title, Meta Description, Meta Keywords, Search Indexing (`robots`), Hero Title & Description, Workspace Name, Website/Docs/Support links, and Footer Attribution Text.
  - Added R2-backed Logo, Favicon, and OpenGraph (`og:image`) upload/preview/reset endpoints (`/api/site-assets/:slot`) synced live across SSR `<head>`, Header, and Footer.
- **Public Namespaces Directory (`/namespaces`):**
  - Replaced top-nav `Teams` with `Namespaces` and added a compact SSR `/namespaces` directory listing every active namespace with public/open-source repository counts, live filtering, and direct profile links.
- **Structured Global Site Footer (`src/client/components/footer.tsx`):**
  - Redesigned the global footer with a 12-column editorial layout, dynamic `/admin/settings` brand lockup, Forge / Account / Resources navigation columns, and dark/light theme parity.
- **Global All-Namespaces Admin Personal Access Tokens:**
  - Added explicit `All namespaces` PAT scope (`pat_global_grants`) exclusively for active `admin` accounts with live active-admin verification on every Git request.
- **Gitra Open-Source GitHub Documentation Suite:**
  - Published SEO-structured documentation under the **Gitra** (`gitra.co`) brand with verified **[Vib Tools](https://vib.tools/)** maintainer and contact details.

### Fixed

- **Reverse-Proxy & Preview Login CSRF (`403 Forbidden`):** Updated `src/worker/auth/origin.ts` to evaluate `X-Forwarded-Host` / `X-Forwarded-Proto` safely alongside `Host` and enabled Vite `server.allowedHosts: true`.

---

## [0.1.0] — 2026-11-22

### Core Platform, UI, RBAC & Error-Handling Foundation

- **Git Smart HTTP v2 Server on Cloudflare Workers:**
  - `ls-refs` and streaming `fetch` (`git-upload-pack`) with pack-first R2 range reads and `Limiter` subrequest budget enforcement.
  - Streaming `git-receive-pack` with single-writer `RepoDurableObject` receive leases (`503 Retry-After: 10`), incremental SHA-1 digesting, connectivity checks, and atomic ref commits.
- **Storage & Queue Architecture:**
  - `RepoDurableObject` SQLite metadata store via Drizzle ORM (`drizzle-orm/durable-sqlite`), Cloudflare D1 directory with session bookmark consistency, R2 pack storage, KV route cache, and Queue background consumer.
- **Web Forge UI, Profiles & Administration:**
  - Two-tier `RepoNav` (`<> Code`, `Commits`, RBAC-gated `Settings`), file tree explorer, syntax-highlighted `BlobPage`, in-browser `BlobEditorIsland`, commit diffs with `MergeExpanderIsland`, two-tab `/:owner` profiles with `.vibtools/profile/README.md`, dedicated `/user/*` User Settings Panel, `/admin/*` Site Administration Control Panel, hardened SSR/JSON error boundaries, and Local Dev Demo Mode seeding.
