# Gitra — Open-Source Serverless Git Forge on Cloudflare Workers

<p align="center">
  <img src="https://raw.githubusercontent.com/vibtools/vibtools.github.io/main/public/brand/vibtools-icon.png" alt="Gitra by Vib Tools" width="64" height="64" />
</p>

<h3 align="center">Fast, self-hosted Git hosting at the edge — zero VMs, zero Docker, Free &amp; Paid Cloudflare ready.</h3>

<p align="center">
  <strong>Git Smart HTTP v2 · Durable Objects SQLite · Cloudflare R2 Pack Storage · D1 RBAC &amp; PAT Auth · Zero-Touch Auto-Deploy · React 19 SSR UI</strong>
</p>

<p align="center">
  <a href="https://gitra.co/">Website (gitra.co)</a> ·
  <a href="https://vib.tools/">Vib Tools</a> ·
  <a href="#quick-start-local-development">Quick Start</a> ·
  <a href="#zero-touch-deploy-to-cloudflare-free--paid">Zero-Touch Deploy</a> ·
  <a href="#a-to-z-feature-guide">A–Z Features</a> ·
  <a href="#system-architecture">Architecture</a> ·
  <a href="#frequently-asked-questions-faq">FAQ</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./SECURITY.md">Security</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Runtime-Cloudflare%20Workers-F38020?logo=cloudflare&amp;logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Protocol-Git%20Smart%20HTTP%20v2-F05032?logo=git&amp;logoColor=white" alt="Git Smart HTTP v2" />
  <img src="https://img.shields.io/badge/Cloudflare%20Tier-Free%20%26%20Paid-16A34A" alt="Cloudflare Free and Paid Plans" />
  <img src="https://img.shields.io/badge/UI-React%2019%20SSR%20%2B%20Tailwind%20v4-38BDF8" alt="React 19 SSR and Tailwind v4" />
</p>

---

## What Is Gitra?

**Gitra** ([gitra.co](https://gitra.co/)) is an **open-source, self-hosted Git forge and Git Smart HTTP v2 server** built to run natively on **Cloudflare Workers**. Designed as a lightweight, serverless alternative to traditional VPS-hosted Git servers like Gitea or Forgejo, Gitra eliminates persistent Linux servers, Docker containers, and background daemons by combining **Cloudflare Durable Objects (SQLite)**, **Cloudflare R2**, **Cloudflare D1**, **Cloudflare KV**, and optional **Cloudflare Queues**.

Built and maintained by **[Vib Tools](https://vib.tools/)** (_Practical software for real workflows_), Gitra gives solo developers, open-source maintainers, and small teams full ownership over public and private Git repositories through standard `git clone`, `git fetch`, and `git push` CLI workflows paired with a fast, compact **React 19 SSR web interface**, customizable site branding & SEO controls, and **one-command zero-touch Cloudflare deployment** on both Free ($0/mo) and Paid ($5/mo+) accounts.

### Why Developers Choose Gitra

- **Zero-VPS Serverless Git Hosting:** Run a real Git Smart HTTP v2 server (`ls-refs`, `fetch`, `side-band-64k`, `ofs-delta`, streaming `git-receive-pack`) globally on Cloudflare's edge network.
- **Runs on Cloudflare Free & Paid Plans:** Works out of the box on the **Cloudflare Workers Free Plan** (automatic Free-tier CPU safeguards + optional Queue-less inline fallback) and scales seamlessly to **Cloudflare Workers Paid ($5/mo+)** with a 5-minute CPU ceiling and automatic background pack compaction.
- **One-Command Zero-Touch Auto-Deploy:** Provide `CLOUDFLARE_API_TOKEN` and optional `APP_DOMAIN=gitra.co` in environment variables; Gitra auto-provisions D1, KV, R2, and Queues on first install, keeps `wrangler.jsonc` completely clean of production IDs/domains, and **never overwrites existing Worker secrets** on rebuilds or redeploys.
- **Linearizable Ref Consistency:** Each repository is governed by an isolated `RepoDurableObject` backed by embedded SQLite (`drizzle-orm/durable-sqlite`), preventing split-brain updates and concurrent push corruption through single-writer receive leases.
- **Complete Self-Hosted Forge Experience:** Includes repository browsing, syntax-highlighted code viewer, in-browser file & README editor, commit diffs with merge side-branch inspection, `/namespaces` public directory, `.vibtools` developer profile READMEs, granular & global Personal Access Tokens (`goc_...`), User Settings (`/user/*`), and Site Administration with live Branding/SEO/Logo/Favicon uploads (`/admin/settings`).

---

## Table of Contents

1. [A-to-Z Feature Guide](#a-to-z-feature-guide)
   - [1. Git Smart HTTP v2 Protocol & Streaming Engine](#1-git-smart-http-v2-protocol--streaming-engine)
   - [2. Hybrid Edge Storage & Optional Queue Compaction](#2-hybrid-edge-storage--optional-queue-compaction)
   - [3. Cloudflare Free & Paid Plan Support](#3-cloudflare-free--paid-plan-support)
   - [4. Zero-Touch, Idempotent Auto-Deploy System](#4-zero-touch-idempotent-auto-deploy-system)
   - [5. Edge Caching, Coalescing & Subrequest Budget Limiter](#5-edge-caching-coalescing--subrequest-budget-limiter)
   - [6. Authentication, 3-Tier RBAC & Personal Access Tokens (PATs)](#6-authentication-3-tier-rbac--personal-access-tokens-pats)
   - [7. Repository Web Forge UI (`/:owner/:repo`)](#7-repository-web-forge-ui-ownerrepo)
   - [8. Public Namespaces Directory (`/namespaces`) & Developer Profiles (`/:owner`)](#8-public-namespaces-directory-namespaces--developer-profiles-owner)
   - [9. Site Branding, SEO Meta & Asset Studio (`/admin/settings`)](#9-site-branding-seo-meta--asset-studio-adminsettings)
   - [10. Dedicated User Settings (`/user/*`) & Site Administration (`/admin/*`)](#10-dedicated-user-settings-user--site-administration-admin)
   - [11. Hardened Error Boundaries, Security & Observability](#11-hardened-error-boundaries-security--observability)
2. [System Architecture](#system-architecture)
3. [Quick Start (Local Development)](#quick-start-local-development)
4. [Zero-Touch Deploy to Cloudflare (Free & Paid)](#zero-touch-deploy-to-cloudflare-free--paid)
5. [Using Git CLI (`clone`, `fetch`, `push`)](#using-git-cli-clone-fetch-push)
6. [Configuration & Cloudflare Bindings](#configuration--cloudflare-bindings)
7. [HTTP Routes & API Reference](#http-routes--api-reference)
8. [Project Structure](#project-structure)
9. [Development, Testing & Validation Commands](#development-testing--validation-commands)
10. [Known Platform Constraints](#known-platform-constraints)
11. [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
12. [Documentation Index](#documentation-index)
13. [Author, Maintainer & Official Contact Information](#author-maintainer--official-contact-information)
14. [License](#license)

---

## A-to-Z Feature Guide

### 1. Git Smart HTTP v2 Protocol & Streaming Engine

- **Service Discovery (`GET /:owner/:repo/info/refs`):**
  - Advertises Git protocol v2 capabilities for `service=git-upload-pack` and `service=git-receive-pack`.
  - Enforces non-disclosure access rules so unauthenticated clients cannot enumerate private repositories (`401` with `WWW-Authenticate: Basic realm="git"` or `404 Not Found`).
- **Streaming Clone & Fetch (`POST /:owner/:repo/git-upload-pack`):**
  - Implements Git v2 `ls-refs` (`peel`, `symrefs`, `ref-prefix`) and `fetch` (`want`, `have`, `done`, `ofs-delta`, `side-band-64k`, `include-tag`).
  - **Pack-First Streaming Assembly:** Resolves object closure from active `.idx` and `.refs` sidecars and streams pack data directly from Cloudflare R2 via byte-range reads without buffering entire packs in memory.
  - Supports `gzip`-compressed Git request payloads (`Content-Encoding: gzip`).
- **Streaming Push & Single-Writer Receive Lease (`POST /:owner/:repo/git-receive-pack`):**
  - Acquires an exclusive, time-bounded receive lease on the repository's `RepoDurableObject` via `beginReceive()`. Concurrent pushes receive `HTTP 503 Service Unavailable` with `Retry-After: 10`.
  - Streams incoming pack bytes directly to staged R2 storage while computing incremental SHA-1 digests using `crypto.DigestStream`.
  - Indexes incoming objects (base objects, `OFS_DELTA`, `REF_DELTA`), validates commit/tree/tag connectivity against existing packs, and commits ref updates (`refs/heads/*`, `refs/tags/*`) atomically via `finalizeReceive()`.

### 2. Hybrid Edge Storage & Optional Queue Compaction

- **Repository Durable Object (`RepoDurableObject`):**
  - Single transactional source of truth for per-repository `refs`, `HEAD`, active pack catalog, receive leases, and compaction scheduling.
  - Backed by embedded SQLite accessed strictly through Drizzle ORM (`src/worker/do/repo/db/dal.ts`).
  - Automatic idle cleanup alarm (`REPO_DO_IDLE_MINUTES`, default `30` minutes).
- **Cloudflare R2 Pack Store (`REPO_BUCKET`):**
  - Stores immutable `.pack`, `.idx`, and `.refs` sidecars along with uploaded site branding assets (logo, favicon, OpenGraph image).
- **Cloudflare D1 Global Directory (`DB`):**
  - Stores user accounts, salted password hashes, namespaces, repository metadata (visibility, description, pinned state, default branch, updated timestamps), Personal Access Tokens (including global admin grants), and instance branding/SEO settings.
  - Uses **D1 Session Bookmark Consistency** (`first-primary` for writes/auth, `first-unconstrained` with bookmark anchoring for reads) so users immediately see their own writes across global read replicas.
- **Cloudflare Queues with Inline Fallback (`REPO_TASKS_QUEUE`):**
  - When bound, processes `compaction`, `compaction-delete`, `pack-ref-backfill`, `route-cache-sync`, and `repository-delete` asynchronously.
  - When omitted (e.g., `USE_QUEUES=false` / `--no-queues` on Free tier), `route-cache-sync` and `repository-delete` automatically fall back to safe inline execution (`src/worker/tasks/dispatch.ts`) without errors.

### 3. Cloudflare Free & Paid Plan Support

Gitra adapts its runtime behavior automatically via the `CLOUDFLARE_TIER` environment variable (`src/worker/common/tier.ts`):

| Capability                               | Free Plan (`CLOUDFLARE_TIER=free`, default)                                | Paid Plan (`CLOUDFLARE_TIER=paid`) |
| :--------------------------------------- | :------------------------------------------------------------------------- | :--------------------------------- |
| **Worker CPU Limit**                     | Free 10ms (`limits.cpu_ms` omitted)                                        | `300000` ms (5 minutes)            |
| **SQLite Durable Objects, D1, KV, R2**   | Included on Free quotas                                                    | Included                           |
| **Cloudflare Queues**                    | Optional (Free 10k ops/day, or `USE_QUEUES=false` inline fallback)         | Enabled                            |
| **Automatic Background Compaction**      | Automatically skipped after push/web-commit to stay inside Free CPU limits | Enabled automatically              |
| **Manual Compaction & All Git/UI Flows** | Supported                                                                  | Supported                          |

### 4. Zero-Touch, Idempotent Auto-Deploy System

Gitra ships with a zero-dependency, API-token-driven deployment engine (`scripts/cf-auto-deploy.mjs` + `scripts/cf-auto-deploy-lib.mjs`):

- **Clean Repository Config:** Committed `wrangler.jsonc` and `wrangler.paid.jsonc` contain **no** hardcoded production database UUIDs, KV IDs, bucket names, or custom domains. Deploy-time configuration is generated ephemerally in git-ignored `.wrangler/deploy.generated.jsonc`.
- **First Install = Full Auto-Provisioning:** Authenticates purely via `CLOUDFLARE_API_TOKEN` (no interactive browser login), auto-detects `CLOUDFLARE_ACCOUNT_ID`, creates missing D1/KV/R2/Queue resources deterministically, runs remote D1 SQL migrations, builds Vite assets, deploys the Worker, and binds `APP_DOMAIN` as a Cloudflare Custom Domain (automatic DNS + TLS).
- **Zero Credential Mismatch Across Unlimited Redeploys:** Queries Cloudflare's Worker Secrets metadata API before uploading secrets. Existing remote secrets (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) are **never overwritten** on rebuilds or redeploys unless `FORCE_ROTATE_SECRETS=true` is explicitly specified.
- **CI/CD Ready:** Includes `.github/workflows/deploy-cloudflare.yml` for one-click GitHub Actions deployments and `--dry-run` preview mode.

### 5. Edge Caching, Coalescing & Subrequest Budget Limiter

- **Two-Tier Edge Cache (`src/worker/cache/`):** Caches immutable Git objects and public responses while automatically enforcing `Cache-Control: private, no-store` and `Vary: Cookie, Authorization` on authenticated or RBAC-sensitive SSR pages.
- **Subrequest & Concurrency Limiter (`src/worker/git/operations/limits.ts`):** Routes request-scoped R2 and Durable Object calls through `Limiter`, enforcing Cloudflare's 6-concurrent-connection cap and `DEFAULT_SUBREQUEST_BUDGET = 900`.

### 6. Authentication, 3-Tier RBAC & Personal Access Tokens (PATs)

- **Browser Session Authentication (`/auth`):**
  - Sign in with username or `@handle` and password (`PBKDF2-SHA256` with per-user salts).
  - Stateless `HMAC-SHA256` signed session cookies (`HttpOnly; Secure; Partitioned; SameSite=None`) with reverse-proxy-aware same-origin CSRF verification (`src/worker/auth/origin.ts`).
  - Immediate session and PAT invalidation when a user is disabled or deleted.
- **3-Tier Role-Based Access Control (RBAC):**
  - **`admin`:** Full repository, user directory, global token, site branding/SEO, and instance management access.
  - **`member`:** Standard developer role; create/manage repositories in owned namespaces, edit files in the browser, customize `.vibtools` profiles, and create `pull`/`push` PATs.
  - **`viewer`:** Read-only role; browse accessible repositories and issue `pull`-only PATs.
- **Granular & Global Personal Access Tokens (`goc_...`):**
  - Stored exclusively as `SHA-256` digests in D1 with last-used tracking and optional expiration (`7d`, `30d`, `90d`, `365d`, `never`).
  - Supports **Single Repository** (`/@handle/repo`), **Namespace-wide** (`/@handle/*`), and **All-Namespaces Global Admin PATs** (`pat_global_grants`, exclusively for active `admin` accounts with live active-admin re-verification on every Git request).

### 7. Repository Web Forge UI (`/:owner/:repo`)

- **Two-Tier Repository Navigation (`RepoNav`):** Owner/repo breadcrumb, visibility badge, branch/tag selector (`RefPickerIsland`), and underline tabs (`<> Code`, `Commits`, and RBAC-gated `Settings`).
- **Code Explorer & Syntax-Highlighted Viewer:** Root overview with clone URL popover + copy fallback, nested directory tree (`TreePage`), line-numbered syntax-highlighted code viewer (`BlobPage`, `highlight.js`), and XSS-sanitized GFM Markdown README rendering.
- **In-Browser Web File Creation & Editing:** Create new files or edit existing text files directly in the browser (`BlobEditorIsland`) with custom commit messages and branch selection.
- **Commit Log, Merge Explorer & Diffs:** Paginated commit history (`CommitsPage`), on-demand merge side-branch expansion (`MergeExpanderIsland`), and unified diff patches (`CommitPage` + `CommitDiffExpanderIsland`).
- **Safe Raw Asset Endpoints:** `/:owner/:repo/raw` serves blobs as `text/plain; charset=utf-8` with `X-Content-Type-Options: nosniff`; `/:owner/:repo/rawpath` enforces same-origin `Referer` checks (`403 Forbidden` on external hotlinks).

### 8. Public Namespaces Directory (`/namespaces`) & Developer Profiles (`/:owner`)

- **Compact Namespaces Directory (`/namespaces`):**
  - Linked directly from the top navigation bar (**Namespaces**).
  - Displays every active namespace with display name, `@handle`, bio, location/website metadata, public & open-source repository counts, live search filter, and one-click navigation into each namespace's public profile.
- **Two-Tab Developer Profiles (`/:owner`):**
  - **`Overview` Tab:** Automatically renders `profile/README.md` from `/:owner/.vibtools` (with an inline editor/initializer for the owner) alongside up to 6 **Pinned repositories**.
  - **`Repositories` Tab:** Searchable, filterable (`All | Public | Private`) repository catalog with owner Pin/Unpin and New Repository modals.

### 9. Site Branding, SEO Meta & Asset Studio (`/admin/settings`)

Administrators can customize the entire Gitra instance live without redeploying code:

- **Identity & Copy:** Site Name, Short Name, Tagline, Workspace Name, Hero Title & Description, Website URL & Label, Documentation URL, Support Email, and Footer Attribution Text.
- **SEO & Search Controls:** Browser `<title>`, Meta Title, Meta Description, Meta Keywords, OpenGraph (`og:title`, `og:description`, `og:image`), Twitter cards, and search engine indexing toggle (`index, follow` vs `noindex, nofollow`).
- **R2-Backed Brand Assets:** Upload, preview, or reset custom **Logo**, **Favicon**, and **OpenGraph Social Card (`og:image`)** stored in R2 and served cleanly via `/api/site-assets/:slot`, automatically syncing across `<head>`, the Header, and the Global Footer.

### 10. Dedicated User Settings (`/user/*`) & Site Administration (`/admin/*`)

- **User Settings Panel (`/user/*`):** Clean sidebar layout (`UserSettingsLayout`) with mobile drawer covering Profile (`/user/profile`), Account & Repos (`/user/account`), Preferences (`/user/settings`), Password & Security (`/user/settings/security`), and Personal Access Tokens (`/user/settings/tokens`).
- **Site Administration Control Panel (`/admin/*`):** Admin-only workspace covering Dashboard KPIs (`/admin`), Users & Accounts directory (`/admin/users`), Global Repositories (`/admin/repositories`), Global Access Tokens audit & issuance (`/admin/tokens`), Site Branding & Instance Settings (`/admin/settings`), and Security & Policies (`/admin/security`).
- **Per-Repository Admin (`/:owner/:repo/admin`):** Inspect/edit `HEAD` & refs, view pack catalog and storage stats, trigger or cancel background compaction, prune superseded packs, or purge a repository with confirmation.
- **Responsive Global Footer:** Dark/light theme-aware structured footer reflecting live `/admin/settings` branding, context-aware Account links, Forge navigation, and external resources.

### 11. Hardened Error Boundaries, Security & Observability

- **Content-Negotiated Error Boundaries:** Browser HTML requests receive styled SSR `ErrorPage` / `NotFoundPage` responses (with an XSS-escaped standalone HTML fallback), while API, Git protocol, and fragment endpoints always receive structured JSON `{ error }` responses.
- **Structured JSON Logging (`src/worker/common/logger.ts`):** Component-scoped kebab-case events controlled via `LOG_LEVEL` (`debug`, `info`, `warn`, `error`).

---

## System Architecture

```text
                       ┌───────────────────────────────────────────────┐
                       │          Clients (Git CLI & Browsers)         │
                       │   git clone / fetch / push  │  HTTPS Web UI   │
                       └──────────────┬──────────────┴────────┬────────┘
                                      │                       │
                                      ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Worker (Hono Router)                            │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │   Git Smart HTTP v2     │  │   Auth, RBAC & Admin    │  │  React 19 SSR +     │  │
│  │  info/refs, upload-pack │  │  Sessions, PATs, CSRF,  │  │  Client Islands UI  │  │
│  │     & receive-pack      │  │   /auth, /user, /admin  │  │  /, /namespaces,    │  │
│  └───────────┬─────────────┘  └────────────┬────────────┘  │  /:owner/:repo/*    │  │
│              │                             │               └──────────┬──────────┘  │
│              └──────────────┬──────────────┴──────────────────────────┘             │
│                             │  Single-Hop Limiter (Budget & Concurrency Control)    │
└───────┬─────────────────────┼───────────────────┬───────────────────────┬───────────┘
        │                     │                   │                       │
        ▼                     ▼                   ▼                       ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────┐   ┌─────────────────────┐
│ Cloudflare D1 │   │ RepoDurableObject │   │ Cloudflare R2 │   │ Cloudflare KV &     │
│  (Directory,  │   │  (Embedded SQLite │   │ (REPO_BUCKET) │   │ Optional Queues     │
│  Users, RBAC, │   │   Refs, HEAD,     │   │  .pack, .idx, │   │  ROUTES KV Cache &  │
│  Repos, PATs, │   │   Pack Catalog,   │   │  .refs, site  │   │  Compaction / Purge │
│  Branding)    │   │   Receive Lease)  │   │  assets)      │   │  (or Inline Fallback│
└───────────────┘   └───────────────────┘   └───────────────┘   └─────────────────────┘
```

### Architectural Invariants

1. **Single-Hop Runtime Boundaries:** Workers call Durable Objects (`Workers -> DO`), R2 (`Workers -> R2`), or D1 (`Workers -> D1`) directly without transitive multi-hop mutations.
2. **Transactional Repository Authority:** `RepoDurableObject` owns all ref, `HEAD`, receive lease, and pack catalog mutations via typed RPC methods returning tagged unions.
3. **Strict Data Access Layers (DAL):** All D1 queries live in `src/worker/db/d1/dal/*` and all Repo DO SQLite queries live in `src/worker/do/repo/db/dal.ts`.

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js** `20+` (`22+` recommended)
- **npm** (or **Bun**)
- **Git CLI** `2.30+` (for Git protocol v2)

### Run Locally in 3 Commands

```bash
# 1. Clone Gitra and install dependencies
git clone https://github.com/vibtoolshq/gitra.git
cd gitra
npm install

# 2. Copy local dev environment template
cp .dev.vars.example .dev.vars

# 3. Start Vite + Cloudflare Workers local dev server
npm run dev
```

Open **`http://localhost:3000`** in your browser.

When `ADMIN_PASSWORD` is left blank in `.dev.vars`, Gitra automatically enables **Local Dev Demo Mode** and seeds two test accounts plus a sample workspace (`/auth`):

| Role                   | Handle / Username        | Password     | Pre-Seeded Workspace                                                                                               |
| :--------------------- | :----------------------- | :----------- | :----------------------------------------------------------------------------------------------------------------- |
| **Site Administrator** | `admin` (`@admin`)       | `admin123`   | Full `/admin/*` Control Panel, Site Branding & SEO Studio (`/admin/settings`), User Directory, and Global PATs     |
| **Developer**          | `alex-dev` (`@alex-dev`) | `devuser123` | `/user/*` settings, public profile `/alex-dev` with `.vibtools/profile/README.md`, and `/alex-dev/cloud-forge-kit` |

---

## Zero-Touch Deploy to Cloudflare (Free & Paid)

You never need to manually edit `wrangler.jsonc` with database UUIDs, KV IDs, or domains.

### One-Time Cloudflare Account Setup

1. **Enable R2 once** in the Cloudflare Dashboard (**R2 Object Storage → Enable R2** — includes 10 GB/month + zero egress on the Free tier).
2. **Create a Cloudflare API Token** (**My Profile → API Tokens → Create Custom Token**) with:
   - Account: `Workers Scripts: Edit`, `D1: Edit`, `Workers KV Storage: Edit`, `Workers R2 Storage: Edit`, `Queues: Edit` _(optional if `USE_QUEUES=false`)_, `Account Settings: Read`
   - Zone _(only if using `APP_DOMAIN`)_: `DNS: Edit`, `Workers Routes: Edit`

### Configure `.env.deploy` & Deploy

```bash
cp .env.deploy.example .env.deploy
```

Edit `.env.deploy` (git-ignored):

```dotenv
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
APP_DOMAIN=gitra.co
APP_NAME=gitra
CLOUDFLARE_TIER=free
USE_QUEUES=true
```

Preview or run the automated installer/deployer:

```bash
# Dry-run preview (makes zero API calls)
npm run cf:auto-deploy -- --dry-run

# Deploy on Cloudflare Workers Free Plan (default)
npm run cf:auto-deploy

# Deploy on Cloudflare Workers Free Plan without Queues (inline fallback)
npm run cf:auto-deploy -- --no-queues

# Deploy on Cloudflare Workers Paid Plan ($5/mo+, 5-min CPU limit & auto compaction)
npm run cf:auto-deploy:paid
```

- **First run:** Auto-creates D1, KV, R2, and Queue, runs D1 SQL migrations, builds, deploys (auto-binding `APP_DOMAIN` Custom Domain + TLS), and seeds missing Worker secrets once.
- **Every future rebuild/redeploy:** Reuses all existing Cloudflare resource IDs and **preserves existing Worker secrets** (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) with zero credential mismatch.

For GitHub Actions CI setup and advanced options, see [`docs/CLOUDFLARE_DEPLOY.md`](./docs/CLOUDFLARE_DEPLOY.md).

---

## Using Git CLI (`clone`, `fetch`, `push`)

### Clone a Public Repository

```bash
git clone https://gitra.co/alex-dev/cloud-forge-kit.git
```

### Push with a Personal Access Token (`goc_...`)

1. Sign in at `/auth` and open **`/user/settings/tokens`** (or **`/admin/tokens`** for Global Admin PATs).
2. Mint a token with **`push`** permission and copy the one-time `goc_...` secret.
3. Push over HTTPS using your namespace handle as username and your `goc_...` PAT as password:

```bash
cd my-project
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://gitra.co/alex-dev/my-project.git
git push -u origin main
```

> **Local Dev Tip:** If local Miniflare intercepts the `401` Basic challenge before Git prompts, send the header directly:
>
> ```bash
> AUTH_B64=$(printf "alex-dev:goc_your_token_here" | base64)
> git -c http.extraHeader="Authorization: Basic ${AUTH_B64}" \
>   push http://localhost:3000/alex-dev/my-project.git HEAD:refs/heads/main
> ```

---

## Configuration & Cloudflare Bindings

### Runtime Environment Variables & Secrets

| Variable                 | Required      | Default                           | Description                                                     |
| :----------------------- | :------------ | :-------------------------------- | :-------------------------------------------------------------- |
| `SESSION_SECRET`         | **Yes**       | _(auto-generated on auto-deploy)_ | HMAC-SHA256 secret used to sign browser session cookies.        |
| `CREDENTIAL_SECRET`      | **Yes**       | _(auto-generated on auto-deploy)_ | Secret used for credential protection.                          |
| `ADMIN_BOOTSTRAP_SECRET` | **Yes**       | _(auto-generated on auto-deploy)_ | Bootstrap secret for initial admin provisioning.                |
| `ADMIN_USERNAME`         | No            | `admin`                           | Primary administrator handle bootstrapped into D1.              |
| `ADMIN_PASSWORD`         | Prod: **Yes** | _(empty in dev)_                  | Primary admin password; setting it disables Local Demo Mode.    |
| `CLOUDFLARE_TIER`        | No            | `free`                            | Runtime tier policy (`free` or `paid`).                         |
| `REPO_DO_IDLE_MINUTES`   | No            | `30`                              | Minutes before an idle `RepoDurableObject` runs cleanup.        |
| `LOG_LEVEL`              | No            | `info`                            | Structured logger verbosity (`debug`, `info`, `warn`, `error`). |

### Cloudflare Bindings

| Binding            | Service                        | Purpose                                                                       |
| :----------------- | :----------------------------- | :---------------------------------------------------------------------------- |
| `REPO_DO`          | Durable Objects (SQLite)       | `RepoDurableObject` — refs, `HEAD`, pack catalog, receive leases.             |
| `DB`               | Cloudflare D1                  | Users, namespaces, repositories, RBAC, PATs, site branding/SEO settings.      |
| `REPO_BUCKET`      | Cloudflare R2                  | Git `.pack`/`.idx`/`.refs` objects and uploaded logo/favicon/OG images.       |
| `ROUTES`           | Cloudflare KV                  | Edge route cache for fast repository ownership and visibility lookups.        |
| `REPO_TASKS_QUEUE` | Cloudflare Queues _(optional)_ | Background compaction, route cache sync, and repository purge jobs.           |
| `ASSETS`           | Workers Static Assets          | Compiled Vite client island bundles (`dist/client`, `html_handling: "none"`). |

---

## HTTP Routes & API Reference

### Git Smart HTTP v2

| Method | Path                             | Auth                         | Description                                                              |
| :----- | :------------------------------- | :--------------------------- | :----------------------------------------------------------------------- |
| `GET`  | `/:owner/:repo/info/refs`        | Public or Basic PAT          | Git v2 capability advertisement (`git-upload-pack`, `git-receive-pack`). |
| `POST` | `/:owner/:repo/git-upload-pack`  | Public or Basic PAT (`pull`) | Git v2 `ls-refs` and streaming `fetch`.                                  |
| `POST` | `/:owner/:repo/git-receive-pack` | Basic PAT (`push`)           | Streaming pack receive, connectivity check, and atomic ref commit.       |

### Web UI & Public Assets

| Method | Path                        | Access              | Description                                                                           |
| :----- | :-------------------------- | :------------------ | :------------------------------------------------------------------------------------ |
| `GET`  | `/` and `/explore`          | Public              | Home landing page and searchable public repository directory.                         |
| `GET`  | `/namespaces`               | Public              | Compact directory of active namespaces with public/open-source repo counts.           |
| `GET`  | `/:owner`                   | Public              | Developer profile (`Overview` with `.vibtools` README & Pinned + `Repositories` tab). |
| `GET`  | `/:owner/:repo`             | Public / Member     | Repository overview (`<> Code`), file table, README, clone popover.                   |
| `GET`  | `/:owner/:repo/tree`        | Public / Member     | Nested directory browser (`?ref=...&path=...`).                                       |
| `GET`  | `/:owner/:repo/blob`        | Public / Member     | Syntax-highlighted file viewer and in-browser editor (`?ref=...&path=...`).           |
| `GET`  | `/:owner/:repo/commits`     | Public / Member     | Paginated commit history with merge side-branch expansion.                            |
| `GET`  | `/:owner/:repo/commit/:oid` | Public / Member     | Single commit metadata and unified diff viewer.                                       |
| `GET`  | `/:owner/:repo/raw`         | Public / Member     | Safe `text/plain` raw blob stream (`?oid=...`).                                       |
| `GET`  | `/:owner/:repo/rawpath`     | Same-Origin Referer | Same-origin protected raw file stream (`?ref=...&path=...`).                          |
| `GET`  | `/:owner/:repo/admin`       | Repo Owner / Admin  | Per-repository refs, `HEAD`, pack catalog, compaction, and purge controls.            |
| `GET`  | `/api/site-assets/:slot`    | Public              | Serves R2-backed custom `logo`, `favicon`, or `og-image` assets.                      |

### Auth, User Panel & Site Administration

| Method | Path                                                                                                   | Access           | Description                                                                     |
| :----- | :----------------------------------------------------------------------------------------------------- | :--------------- | :------------------------------------------------------------------------------ |
| `GET`  | `/auth`                                                                                                | Public           | Sign-in page (plus local Demo Mode quick login when `ADMIN_PASSWORD` is unset). |
| `POST` | `/auth/login`, `/auth/logout`                                                                          | Public / Session | Session authentication and sign-out endpoints.                                  |
| `GET`  | `/user/profile`, `/user/account`, `/user/settings`, `/user/settings/security`, `/user/settings/tokens` | Signed-in User   | Dedicated User Settings Panel (`/user/*`).                                      |
| `GET`  | `/admin`, `/admin/users`, `/admin/repositories`, `/admin/tokens`, `/admin/settings`, `/admin/security` | `admin` Role     | Global Site Administration Control Panel (`/admin/*`).                          |

For full JSON request/response schemas, see [`docs/api-endpoints.md`](./docs/api-endpoints.md).

---

## Project Structure

```text
gitra/
├── .github/                  # GitHub Actions auto-deploy workflow, Issue & PR templates
├── docs/                     # Deployment, architecture, storage, caching & API documentation
├── drizzle/                  # Generated SQL migrations for D1 and Repo Durable Object SQLite
├── scripts/                  # Zero-touch Cloudflare auto-deployer (cf-auto-deploy.mjs) & CLI helpers
├── src/
│   ├── client/
│   │   ├── components/       # Shared SSR components (Header, Footer, RepoNav, User/Admin layouts)
│   │   ├── entries/          # Vite client hydration entrypoints
│   │   ├── islands/          # Focused interactive client islands (editor, tokens, admin settings, etc.)
│   │   ├── pages/            # Route-level React 19 SSR pages (Home, Namespaces, Repo, Admin, User)
│   │   ├── server/           # SSR document shell, SEO head tags, view registry & error boundaries
│   │   └── styles/           # Tailwind CSS v4 design tokens (dark-first + light mode parity)
│   ├── shared/               # Browser-safe branding, namespace, slug, formatting & RBAC helpers
│   └── worker/
│       ├── auth/             # Sessions, PBKDF2 passwords, PAT hashing, Global Admin PATs, CSRF
│       ├── branding/         # Site settings & R2 branding asset persistence
│       ├── cache/            # Edge cache policies and cache-key builders
│       ├── common/           # Structured logger, Cloudflare tier policy, compression & hex helpers
│       ├── db/d1/            # Cloudflare D1 Drizzle schema, bootstrap & Data Access Layer (DAL)
│       ├── do/repo/          # RepoDurableObject, receive leases, compaction & SQLite DAL
│       ├── git/              # Git Smart HTTP v2 protocol, pack assembly, indexer & Limiter
│       ├── routes/           # Hono route modules (git, auth, user, admin, systemAdmin, UI SSR)
│       ├── tasks/            # Queue consumer + inline Free-tier fallback dispatcher
│       └── index.ts          # Main Worker entrypoint, router registration & error boundary
├── test/                     # Node unit tests & Cloudflare Workers integration tests
├── .dev.vars.example         # Local development environment template
├── .env.deploy.example       # Zero-touch Cloudflare auto-deploy environment template
├── wrangler.jsonc            # Clean account-agnostic Free-tier template config
└── wrangler.paid.jsonc       # Clean account-agnostic Paid-tier template config
```

---

## Development, Testing & Validation Commands

```bash
# Start local development server (Vite + Cloudflare Workers SSR)
npm run dev

# Build production bundles (Free default / Paid)
npm run build
npm run build:paid

# Regenerate Wrangler runtime types and run strict TypeScript check
npm run typecheck

# Check or fix formatting with Prettier
npm run format:check
npm run format

# Run fast Node unit tests (Vitest + node:test)
npm run test
npx tsx --test test/cloudflare-tier.node-test.ts test/cf-auto-deploy.node-test.ts

# Run Cloudflare Workers integration tests
npm run test:workers

# Zero-touch deploy to Cloudflare (Free / Paid / Dry-Run)
npm run cf:auto-deploy -- --dry-run
npm run cf:auto-deploy
npm run cf:auto-deploy:paid

# Generate Drizzle migrations after editing schema files
npm run db:generate
```

---

## Known Platform Constraints

- **HTTPS Git Smart HTTP v2 Only:** Cloudflare Workers handle HTTP(S) traffic; SSH (`git@...`) is not supported. Authenticate using HTTPS URLs and `goc_...` Personal Access Tokens.
- **Cloudflare Free vs Paid CPU Limits:** Free accounts enforce a 10ms CPU limit per request (Gitra automatically disables heavy background compaction on Free tier so typical pushes/clones stay within budget). Large monorepo pushes benefit from Cloudflare Workers Paid ($5/mo, `CLOUDFLARE_TIER=paid`, `limits.cpu_ms = 300000`).
- **Thick Pack Transfer:** `thin-pack` is intentionally not advertised so clients exchange self-contained packs (`side-band-64k`, `ofs-delta`).
- **Focused Code Forge Scope:** Engineered for fast self-hosted Git hosting, code browsing, web file editing, namespaces, developer profiles, PAT authentication, and site administration without bundled heavy CI runners.

---

## Frequently Asked Questions (FAQ)

### Can I self-host Gitra on a Cloudflare Free account?

Yes. Gitra is Cloudflare Free Plan friendly by default (`CLOUDFLARE_TIER=free`). SQLite Durable Objects, D1, KV, R2 (10 GB/month free after one-time activation), and Queues (10k ops/day free, or optional `--no-queues` inline fallback) all work on the Free tier.

### Will rebuilding or redeploying Gitra break existing passwords, sessions, or Git PATs?

No. `npm run cf:auto-deploy` queries existing Cloudflare resource IDs and existing Worker secret names before deploying. Existing D1/KV/R2 resources are reused and existing secrets (`SESSION_SECRET`, `CREDENTIAL_SECRET`, `ADMIN_BOOTSTRAP_SECRET`) are preserved untouched across unlimited redeploys.

### How is Gitra different from Gitea or Forgejo?

Gitea and Forgejo are full Go applications requiring a persistent VPS, container host, or VM with disk management and backups. Gitra runs 100% serverlessly on Cloudflare Workers + Durable Objects + R2 + D1 with zero servers to patch and global edge routing out of the box.

### How do I bind my own domain like `gitra.co` or `git.yourdomain.com`?

Set `APP_DOMAIN=gitra.co` in `.env.deploy` (or GitHub Actions variables) where the root zone is in your Cloudflare account, then run `npm run cf:auto-deploy`. Cloudflare automatically provisions the DNS record, TLS certificate, and Custom Domain route.

---

## Documentation Index

### Deployment & Architecture (`docs/`)

- **[Zero-Touch Cloudflare Deployment Guide](./docs/CLOUDFLARE_DEPLOY.md)** — Free & Paid plan setup, `.env.deploy`, and GitHub Actions.
- **[API Endpoints Reference](./docs/api-endpoints.md)** — Complete HTTP route and JSON payload reference.
- **[Architecture Overview](./docs/architecture.md)** — Subsystem boundaries and request lifecycle.
- **[Hybrid Storage Model](./docs/storage.md)** — Durable Object SQLite + R2 pack storage design.
- **[Data Flows](./docs/data-flows.md)** — End-to-end `git push`, `git fetch`, and SSR UI rendering flows.
- **[Caching Strategy](./docs/caching.md)** — Two-tier edge caching and private cache isolation.
- **[Diff Rendering](./docs/diff.md)** — Commit diff and merge-commit expansion internals.

### Community & Governance

- **[Contributing Guide](./CONTRIBUTING.md)** — Architecture rules, dev setup, and validation matrix.
- **[Security Policy](./SECURITY.md)** — Built-in security posture and private vulnerability disclosure.
- **[Support & Troubleshooting Guide](./SUPPORT.md)** — Official Vib Tools contact routing and FAQ.
- **[Changelog](./CHANGELOG.md)** — Release history and milestone updates.
- **[Code of Conduct](./CODE_OF_CONDUCT.md)** — Community standards and enforcement channels.

---

## Author, Maintainer & Official Contact Information

### About Vib Tools

**Gitra** ([gitra.co](https://gitra.co/)) is developed and maintained by **[Vib Tools](https://vib.tools/)** (`Vib.Tools` / `vibtools`), a software organization building practical desktop applications, self-hosted software, automation tooling, developer utilities, reusable frameworks, and open-source projects for real workflows.

> **Mission:** _Build free and open-source tools that help people do real work with less complexity._  
> **Philosophy:** _Practical software for real workflows._ · _Build Useful Tools. Share Them Openly._

### Maintainer Identity

- **Project Website:** [https://gitra.co/](https://gitra.co/)
- **Organization / Brand:** [Vib Tools](https://vib.tools/)
- **Connected GitHub Organization & Maintainer Account:** [Vib Tools (`@vibtoolshq`)](https://github.com/vibtoolshq)  
  _(Vib Tools is the connected GitHub account holder associated with maintaining and administering Vib Tools repositories.)_

### Official Contact Channels

| Channel                         | Contact / Destination                                                      | Purpose                                                                |
| :------------------------------ | :------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **Gitra Project Website**       | [https://gitra.co/](https://gitra.co/)                                     | Official Gitra project site                                            |
| **Vib Tools Website**           | [https://vib.tools/](https://vib.tools/)                                   | Official product catalog, status updates, and company overview         |
| **GitHub Organization**         | [https://github.com/vibtoolshq](https://github.com/vibtoolshq)             | Public source repositories, issues, and pull requests                  |
| **GitLab Organization**         | [https://gitlab.com/vibtools](https://gitlab.com/vibtools)                 | Official GitLab organization profile (`@vibtools`)                     |
| **General Inquiries**           | [hello@vibtools.io](mailto:hello@vibtools.io)                              | Partnerships, press/media, company inquiries, and general questions    |
| **Product & Technical Support** | [support@vibtools.io](mailto:support@vibtools.io)                          | Technical support for public projects and private security disclosures |
| **Phone / WhatsApp**            | `+880 1795-470603` (`+8801795470603`)                                      | Direct phone & WhatsApp contact (Bangladesh, GMT+6 / Asia-Dhaka)       |
| **Head Office**                 | **Vib Tools HQ**, 5660 Kochakata, Nageswari, Kurigram, Rangpur, Bangladesh | Published physical head office address                                 |

### Official Social & Community Profiles

- **Website:** [https://vib.tools/](https://vib.tools/)
- **GitHub:** [https://github.com/vibtoolshq](https://github.com/vibtoolshq)
- **GitLab:** [https://gitlab.com/vibtools](https://gitlab.com/vibtools)
- **X (Twitter):** [https://x.com/vibtools](https://x.com/vibtools) (`@vibtools`)
- **Facebook:** [https://www.facebook.com/vib.tools](https://www.facebook.com/vib.tools) (`vib.tools`)
- **Instagram:** [https://www.instagram.com/vib.tools/](https://www.instagram.com/vib.tools/)
- **Reddit:** [https://www.reddit.com/user/VibTools/](https://www.reddit.com/user/VibTools/) (`u/VibTools`)
- **TikTok:** [https://www.tiktok.com/@vibtools](https://www.tiktok.com/@vibtools) (`@vibtools`)
- **Official Brand Assets:** [https://github.com/vibtoolshq/vibtools-brand-assets](https://github.com/vibtoolshq/vibtools-brand-assets)

---

## License

Gitra is open-source software licensed under the **[MIT License](./LICENSE)**. Copyright © 2026 [Vib Tools](https://vib.tools/). Always review individual repository [`LICENSE`](./LICENSE), [`SECURITY.md`](./SECURITY.md), and [`CONTRIBUTING.md`](./CONTRIBUTING.md) files before distribution or reuse.
