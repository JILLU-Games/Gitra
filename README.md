# git-on-cloudflare — Edge-Native Self-Hosted Git Smart HTTP v2 Server & Code Forge on Cloudflare Workers

<p align="center">
  <img src="https://raw.githubusercontent.com/vibtools/vibtools.github.io/main/public/brand/vibtools-icon.png" alt="Vib Tools Logo" width="64" height="64" />
</p>

<h3 align="center">Practical, Self-Hosted Git Infrastructure at the Edge — Zero VMs, Zero Containers</h3>

<p align="center">
  <strong>Full Git Smart HTTP v2 Protocol · Durable Objects SQLite · Cloudflare R2 Pack Storage · D1 RBAC & PAT Auth · React 19 SSR Code Forge UI</strong>
</p>

<p align="center">
  <a href="https://vibtools.io/">Official Website</a> ·
  <a href="https://github.com/vibtoolshq">Vib Tools GitHub</a> ·
  <a href="#quick-start-local-development--demo-mode">Quick Start</a> ·
  <a href="#a-to-z-feature-guide">A–Z Features</a> ·
  <a href="#system-architecture">Architecture</a> ·
  <a href="#deploy-to-cloudflare-workers">Deploy</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./SECURITY.md">Security</a>
</p>

---

## Overview

**`git-on-cloudflare`** is a production-grade, self-hosted **Git Smart HTTP v2 server and web code forge** engineered to run 100% natively on **Cloudflare Workers**. Instead of running persistent Linux virtual machines, Docker containers, or heavy background daemons, `git-on-cloudflare` combines **Cloudflare Durable Objects (SQLite)**, **Cloudflare R2**, **Cloudflare D1**, **Cloudflare KV**, and **Cloudflare Queues** to host public and private Git repositories at the edge with linearizable ref consistency and sub-50ms cached response times worldwide.

Developed and maintained by **[Vib Tools](https://vibtools.io/)** (_Practical software for real workflows_), `git-on-cloudflare` gives solo developers, technical teams, and self-hosters complete operational control over their source code repositories through standard `git clone`, `git fetch`, and `git push` CLI workflows paired with a fast, GitHub/Forgejo-inspired **React 19 Server-Side Rendered (SSR) Web UI**.

### Why `git-on-cloudflare`?

- **True Serverless Git Engine:** Implements the Git Smart HTTP v2 wire protocol (`ls-refs`, `fetch`, `side-band-64k`, `ofs-delta`, and streaming `git-receive-pack`) directly inside Cloudflare Workers.
- **Linearizable Ref Authority:** Each repository is backed by an isolated `RepoDurableObject` with embedded SQLite (`drizzle-orm/durable-sqlite`), preventing split-brain ref updates and concurrent push corruption via single-writer receive leases.
- **Pack-First R2 Object Storage:** Streams Git packfiles (`.pack`, `.idx`, `.refs`) directly to and from Cloudflare R2 using byte-range reads and incremental SHA-1 `crypto.DigestStream` verification.
- **Complete Identity, RBAC & PAT Security:** Built-in Cloudflare D1 user directory, namespace ownership, 3-tier Role-Based Access Control (`admin`, `member`, `viewer`), HMAC-signed session cookies, and granular `goc_...` Personal Access Tokens (`pull` / `push`).
- **Clean, Compact Developer UI:** Dark-first cool-slate aesthetic (`#0d1117` / `#161b22` / `#010409`) with light-mode toggle, `Hanken Grotesk` + `JetBrains Mono` typography, repository file explorer, syntax-highlighted code viewer, in-browser file & README editor, interactive merge commit explorer, `.vibtools` developer profile READMEs, User Settings panel (`/user/*`), and Site Administration Control Panel (`/admin/*`).

---

## Table of Contents

1. [A-to-Z Feature Guide](#a-to-z-feature-guide)
   - [1. Git Smart HTTP v2 Protocol & Streaming Engine](#1-git-smart-http-v2-protocol--streaming-engine)
   - [2. Hybrid Edge Storage & Background Queue Compaction](#2-hybrid-edge-storage--background-queue-compaction)
   - [3. Edge Caching, Coalescing & Subrequest Budget Limiter](#3-edge-caching-coalescing--subrequest-budget-limiter)
   - [4. Authentication, 3-Tier RBAC & Personal Access Tokens (PATs)](#4-authentication-3-tier-rbac--personal-access-tokens-pats)
   - [5. Repository Web Forge UI (`/:owner/:repo`)](#5-repository-web-forge-ui-ownerrepo)
   - [6. Public Developer Profiles (`/:owner`) & `.vibtools` Profile README](#6-public-developer-profiles-owner--vibtools-profile-readme)
   - [7. Dedicated User Settings Panel (`/user/*`)](#7-dedicated-user-settings-panel-user)
   - [8. Site Administration Control Panel (`/admin/*`) & Repo Admin](#8-site-administration-control-panel-admin--repo-admin)
   - [9. Hardened Error Boundaries, Security & Observability](#9-hardened-error-boundaries-security--observability)
2. [System Architecture](#system-architecture)
3. [Quick Start (Local Development & Demo Mode)](#quick-start-local-development--demo-mode)
4. [Using Git CLI (`clone`, `fetch`, `push`)](#using-git-cli-clone-fetch-push)
5. [Deploy to Cloudflare Workers](#deploy-to-cloudflare-workers)
6. [Configuration & Cloudflare Bindings](#configuration--cloudflare-bindings)
7. [HTTP Routes & API Reference](#http-routes--api-reference)
8. [Project Directory Structure](#project-directory-structure)
9. [Development, Testing & Validation Commands](#development-testing--validation-commands)
10. [Known Platform Constraints](#known-platform-constraints)
11. [Documentation Index](#documentation-index)
12. [Author, Maintainer & Official Contact Information](#author-maintainer--official-contact-information)
13. [License](#license)

---

## A-to-Z Feature Guide

### 1. Git Smart HTTP v2 Protocol & Streaming Engine

- **Service Discovery (`GET /:owner/:repo/info/refs`):**
  - Supports `service=git-upload-pack` and `service=git-receive-pack` over Git protocol v2 (`version 2` capability advertisement).
  - Enforces non-disclosure access control: private repositories return `401 Unauthorized` (with `WWW-Authenticate: Basic realm="git"`) or `404 Not Found` to unauthenticated clients so private repository existence is never leaked.
- **Streaming Clone & Fetch (`POST /:owner/:repo/git-upload-pack`):**
  - Full protocol v2 command support for `ls-refs` (with `peel`, `symrefs`, and `ref-prefix` filtering) and `fetch` (`want`, `have`, `done`, `ofs-delta`, `side-band-64k`, `include-tag`).
  - **Pack-First Streaming Assembly:** Resolves object closure from active `.idx` and `.refs` metadata and streams pack data directly from Cloudflare R2 using range reads—avoiding whole-pack memory buffering when serving selective fetches.
  - Supports `gzip` request body decompression (`Content-Encoding: gzip`).
- **Streaming Push & Single-Writer Receive Lease (`POST /:owner/:repo/git-receive-pack`):**
  - Acquires an exclusive, time-bounded receive lease on the target `RepoDurableObject` via `beginReceive()`. Concurrent pushes during an active receive lease cleanly receive `HTTP 503 Service Unavailable` with `Retry-After: 10`.
  - Streams incoming packfile bytes directly to a staged R2 key while computing incremental SHA-1 checksums via `crypto.DigestStream`.
  - Indexes incoming objects (base objects, `OFS_DELTA`, and `REF_DELTA`), validates commit/tree/tag connectivity against existing repository objects, and atomically commits ref updates (`refs/heads/*`, `refs/tags/*`) via `finalizeReceive()`.

### 2. Hybrid Edge Storage & Background Queue Compaction

- **Repository Durable Object (`RepoDurableObject`):**
  - Single source of truth for per-repository `refs`, `HEAD`, active pack catalog, receive leases, and compaction scheduling.
  - Uses embedded SQLite managed through Drizzle ORM (`src/worker/do/repo/db/dal.ts` and `schema.ts`).
  - Automatic idle cleanup alarm (`REPO_DO_IDLE_MINUTES`, default `30` minutes) to keep storage footprint clean when a repository is empty or idle.
- **Cloudflare R2 Pack Store (`REPO_BUCKET`):**
  - Stores immutable packfiles (`*.pack`), pack index files (`*.idx`), and ref-index sidecar files (`*.refs`).
  - Eliminates loose-object dependence on the read path for high-throughput multi-pack union reads.
- **Cloudflare D1 Global Directory (`DB`):**
  - Stores user accounts, password hashes, namespaces, repository registry metadata (visibility, description, pinned status, default branch, update timestamps), and Personal Access Tokens.
  - Uses **D1 Session Bookmark Consistency** (`first-primary` for writes/auth, `first-unconstrained` with bookmark cookie anchoring for reads) to prevent stale replica reads after mutations.
- **Cloudflare Queues Background Tasks (`REPO_TASKS_QUEUE`):**
  - Asynchronous queue consumer (`src/worker/tasks/queue.ts`) processes:
    - **`compaction`:** Merges multiple small receive packs into compacted packs in the background without blocking `git push` or `git fetch`.
    - **`route-cache-sync`:** Synchronizes repository route ownership and visibility flags into Cloudflare KV (`ROUTES`).
    - **`repository-delete`:** Safely purges R2 pack assets and DO storage after repository deletion.

### 3. Edge Caching, Coalescing & Subrequest Budget Limiter

- **Two-Tier Edge Cache (`src/worker/cache/`):**
  - Immutable Git objects and pack reads are cached at the edge with long TTLs.
  - Public UI SSR pages utilize smart cache policies while authenticated or RBAC-sensitive responses automatically call `markRequestPrivate()` and emit `Cache-Control: private, no-store` with `Vary: Cookie, Authorization`.
- **Platform Subrequest & Concurrency Limiter (`src/worker/git/operations/limits.ts`):**
  - Every request-scoped R2 call and outbound Durable Object RPC passes through `Limiter` (`limiter.run(label, fn)`).
  - Enforces Cloudflare Workers' 6-concurrent-connection limit and tracks the per-request subrequest budget (`DEFAULT_SUBREQUEST_BUDGET = 900`, `RECEIVE_SUBREQUEST_BUDGET`) to prevent hard platform ceiling failures on large repositories.

### 4. Authentication, 3-Tier RBAC & Personal Access Tokens (PATs)

- **Browser Session Authentication (`/auth`):**
  - Sign in with username or `@handle` and password.
  - Passwords hashed using `PBKDF2-SHA256` with per-user cryptographic salts (`src/worker/auth/passwords.ts`).
  - Stateless HMAC-SHA256 signed session cookies sealed with `SESSION_SECRET` using `HttpOnly; Secure; Partitioned; SameSite=None` flags for iframe and cross-context compatibility.
  - Immediate session revocation when a user account is disabled or deleted in D1.
- **3-Tier Role-Based Access Control (RBAC):**
  - **`admin`:** Full access to repository creation/push, personal settings, per-repo administration, and the global Site Administration Control Panel (`/admin/*`).
  - **`member`:** Standard developer role; can create and manage repositories in owned namespaces, edit files in the web UI, manage `.vibtools` profile READMEs, and issue `pull` or `push` PATs.
  - **`viewer`:** Read-only directory role; can browse accessible repositories and issue `pull`-only PATs, with repository creation and `push` token scopes disabled in both UI and API.
- **Granular Personal Access Tokens (`goc_...`):**
  - Format: `goc_<id>_<secret>`, stored as `SHA-256` hashes in D1 (`src/worker/auth/pat.ts`).
  - Supports **Namespace-wide** (`/@handle/*`) or **Single-Repository** (`/@handle/repo`) scoping.
  - Supports **`pull`** (read/clone) or **`push`** (read + write) access levels and optional expiration windows (`7d`, `30d`, `90d`, `365d`, or `never`).
  - Automatically tracks `lastUsedAt` timestamps on Git Smart HTTP requests.
- **Dev & Preview Seeded Demo Workspace:**
  - When `ADMIN_PASSWORD` is unset in local development or preview environments, the server enables quick-test demo accounts and idempotently seeds a complete showcase workspace (`src/worker/auth/demoSeed.ts`):
    - **`@admin` (`admin` / `admin123`):** Primary Site Administrator.
    - **`@alex-dev` (`alex-dev` / `devuser123`):** Seeded developer account with `.vibtools` (`profile/README.md`) and `alex-dev/cloud-forge-kit` (a complete multi-directory TypeScript Worker starter kit repository with `.github/workflows/ci.yml`, `docs/ARCHITECTURE.md`, `src/`, `test/`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `package.json`, `tsconfig.json`, and `wrangler.jsonc`).

### 5. Repository Web Forge UI (`/:owner/:repo`)

- **GitHub/Gitea-Style Two-Tier Repository Header (`RepoNav`):**
  - Tier 1 displays the owner/repository breadcrumb (`alex-dev / cloud-forge-kit`), `Public`/`Private` visibility badge, and branch/tag selector (`RefPickerIsland`).
  - Tier 2 provides full-width horizontal underline tabs:
    - **`<> Code`** (`/:owner/:repo`)
    - **`Commits`** (`/:owner/:repo/commits`)
    - **`Settings`** (`/:owner/:repo/admin`) — **strictly gated by `canViewerManageRepo`** so anonymous visitors and read-only viewers never see admin navigation links.
- **Repository Overview (`OverviewPage`):**
  - Displays branch/tag summary, clone URL popover (`<> Code` button with one-click copy and clipboard fallback feedback), root file/directory table with latest commit OIDs, automatic `README.md` rendering (with GFM tables, task lists, relative link/image resolution, and XSS-safe HTML sanitization), plus an **About** and **Branches** sidebar.
- **Directory Tree & Syntax-Highlighted Blob Viewer (`TreePage` & `BlobPage`):**
  - Navigate nested directories (`/:owner/:repo/tree?ref=...&path=...`) with breadcrumb path segments.
  - View source files (`/:owner/:repo/blob?ref=...&path=...`) with line numbers, syntax highlighting (`highlight.js`), markdown preview toggle, raw file link, and file size/line metrics.
- **In-Browser Web File Creation & Blob Editor:**
  - Authorized repo owners can create new files directly from the repository overview or edit existing text files in the browser (`BlobEditorIsland`) with custom commit messages and target branch selection—committing directly to the repository pack/object store without needing a local checkout.
- **Commit History, Merge Side-Branch Explorer & Diff Viewer (`CommitsPage` & `CommitPage`):**
  - Paginated commit log with author, timestamp, commit title, and short SHA links.
  - **Interactive Merge Commit Expander (`MergeExpanderIsland`):** Expand merge commits inline to inspect side-branch commit history fetched on demand (`/:owner/:repo/commits/fragments/:oid`).
  - **Commit Diff View (`/:owner/:repo/commit/:oid`):** Full commit metadata, parent links, changed-file stats, and unified diff patches with lazy-loaded diff expansion (`CommitDiffExpanderIsland`).
- **Safe Raw Content Streaming (`/raw` & `/rawpath`):**
  - `GET /:owner/:repo/raw?oid=...` serves blob content as safe `text/plain; charset=utf-8` with `X-Content-Type-Options: nosniff`.
  - `GET /:owner/:repo/rawpath?ref=...&path=...` streams inline media/assets for README rendering while enforcing a strict same-origin `Referer` check (`403 Forbidden` on cross-site hotlinks).

### 6. Public Developer Profiles (`/:owner`) & `.vibtools` Profile README

- **Clean Public Profile Header (`OwnerPage`):**
  - Displays avatar badge, display name, `@handle`, bio, repository counts (`N repositories · M public`), location, and website link.
  - Privacy-hardened: internal RBAC role pills (`MEMBER` / `VIEWER`) and internal dotfile shortcuts are hidden from anonymous public visitors.
- **Two-Tab Profile Workspace (`OwnerReposIsland`):**
  - **`Overview` Tab:**
    - Automatically renders `profile/README.md` from the user's `/{owner}/.vibtools` repository (complete with an in-browser **Edit README** / `.vibtools` initializer modal for the profile owner).
    - Displays up to 6 **Pinned repositories** (or popular repositories fallback) in a clean 2-column card grid without duplicating the full searchable directory underneath.
  - **`Repositories (N)` Tab:**
    - Dedicated searchable and filterable (`All | Public | Private`) repository directory with one-click **Pin / Unpin** controls and **New repository** creation modal for the owner.

### 7. Dedicated User Settings Panel (`/user/*`)

- **Clean Separation from Site Administration:**
  - Dedicated left-sidebar layout (`UserSettingsLayout`) with desktop persistent navigation and a `<640px` mobile slide-over drawer (`#user-sidebar-drawer`)—completely free of leaked admin CTAs or redundant navigation clutter.
- **Five Focused Sections:**
  - **`/user/profile` (`Profile`):** Identity summary (`@handle`, display name, role, account ID), public profile metadata editor (Display Name, Location, Website URL, Bio), and single `Public profile ↗` link.
  - **`/user/account` (`Account & Repos`):** Owned namespaces and repository management table (create repositories, toggle `Public`/`Private` visibility, edit descriptions, pin/unpin, or delete repositories).
  - **`/user/settings` (`Settings`):** Consolidated account preferences, profile details, and security controls.
  - **`/user/settings/security` (`Password & Security`):** Self-service password change form (`ChangePasswordIsland`) with current-password verification.
  - **`/user/settings/tokens` (`Access Tokens`):** Issue, copy, inspect, and revoke namespace-scoped or repository-scoped Personal Access Tokens (`TokensIsland`).

### 8. Site Administration Control Panel (`/admin/*`) & Repo Admin

- **Global Site Administration (`/admin/*` — Admin Role Only):**
  - Accessible via the top-right `@admin` user menu (`Control Panel`), backed by a responsive sidebar and `<640px` mobile slide-over drawer (`AdminSettingsLayout`):
  - **`/admin` (`Dashboard`):** Instance KPIs (Total Repositories, Active Users/Namespaces, Personal Access Tokens), recent repository table, user directory role breakdown, and quick control shortcuts.
  - **`/admin/users` (`Users & Accounts`):** Searchable user directory (`AdminUsersIsland`) to create users, assign roles (`admin` / `member` / `viewer`), reset passwords, enable/disable accounts, edit profile metadata, or delete non-admin accounts (with primary-admin protection rules).
  - **`/admin/repositories` (`Repositories`):** Global repository inventory across all namespaces with visibility toggles, description editing, and administrative deletion.
  - **`/admin/tokens` (`Access Tokens`):** Instance-wide PAT audit table with token prefix, owner, scope, access level, last-used timestamp, and instant administrative revocation.
  - **`/admin/settings` (`Instance Settings`):** Runtime health, storage binding status (`D1`, `R2`, `Repo DO`, `KV`, `Queues`), idle cleanup thresholds, and authentication mode overview.
  - **`/admin/security` (`Security & Policies`):** Live RBAC capability matrix, session cookie security posture (`HttpOnly`, `Secure`, `Partitioned`, `SameSite=None`), `PBKDF2-SHA256` password policy, and `SHA-256` PAT verification policies.
- **Per-Repository Administration (`/:owner/:repo/admin`):**
  - Inspect and update `HEAD` and branch/tag refs.
  - View storage metrics, active pack catalog, and compaction status (`RepoAdminIsland`).
  - Trigger or cancel background pack compaction, remove superseded packfiles, or execute a confirmation-gated full repository purge.

### 9. Hardened Error Boundaries, Security & Observability

- **Content-Negotiated Global Error Boundary (`src/worker/index.ts` & `src/client/server/error.ts`):**
  - Browser HTML navigation requests (`Accept: text/html`) that hit an unhandled exception or invalid parameter (`400`, `404`, `500`) render a styled SSR `ErrorPage` or `NotFoundPage` (with an XSS-escaped standalone HTML fallback document if SSR rendering itself fails).
  - API routes (`*/api/*`), Git Smart HTTP routes, admin endpoints, and diff fragments deterministically receive structured JSON `{ error }` responses.
- **Resilient Client Islands UX:**
  - Explicit HTTP `401` session-expiry detection across form islands displays `"Session expired — please sign in again."` with an inline `/auth` sign-in link.
  - Graceful clipboard fallback banner (`"Clipboard unavailable — select and copy manually"`) when running inside restricted browser/iframe permission contexts.
- **Structured JSON Logging (`src/worker/common/logger.ts`):**
  - Component-scoped structured logs (`receive:finalize-committed`, `overview:markdown-candidate-miss`, `worker:unhandled-error`, etc.) controlled via `LOG_LEVEL` (`debug`, `info`, `warn`, `error`).

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
│  │     & receive-pack      │  │   /auth, /user, /admin  │  │  /:owner/:repo/*    │  │
│  └───────────┬─────────────┘  └────────────┬────────────┘  └──────────┬──────────┘  │
│              │                             │                          │             │
│              └──────────────┬──────────────┴──────────────────────────┘             │
│                             │  Single-Hop Limiter (Budget & Concurrency Control)    │
└───────┬─────────────────────┼───────────────────┬───────────────────────┬───────────┘
        │                     │                   │                       │
        ▼                     ▼                   ▼                       ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────┐   ┌─────────────────────┐
│ Cloudflare D1 │   │ RepoDurableObject │   │ Cloudflare R2 │   │ Cloudflare KV &     │
│  (Directory,  │   │  (Embedded SQLite │   │ (REPO_BUCKET) │   │ Queues              │
│  Users, RBAC, │   │   Refs, HEAD,     │   │  .pack, .idx, │   │  ROUTES KV Cache &  │
│  Repos, PATs) │   │   Pack Catalog,   │   │  .refs files  │   │  Compaction / Purge │
│               │   │   Receive Lease)  │   │               │   │  Background Queue   │
└───────────────┘   └───────────────────┘   └───────────────┘   └─────────────────────┘
```

### Architectural Invariants

1. **Single-Hop Runtime Boundaries:** Workers call Durable Objects (`Workers -> DO`), R2 (`Workers -> R2`), or D1 (`Workers -> D1`) directly without chaining transitive multi-hop mutations.
2. **Transactional Repository Authority:** `RepoDurableObject` owns all transactional mutations to repository refs, HEAD, receive leases, and pack catalogs via typed RPC methods returning tagged unions.
3. **Strict Data Access Layers (DAL):** All D1 queries go through `src/worker/db/d1/dal/*` and all Durable Object SQLite queries go through `src/worker/do/repo/db/dal.ts`.

---

## Quick Start (Local Development & Demo Mode)

### Prerequisites

- **Node.js** `20+` (or `22+` recommended)
- **npm** (or **Bun**)
- **Git CLI** (`2.30+` for Git protocol v2)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/vibtoolshq/git-on-cloudflare.git
cd git-on-cloudflare
npm install
```

### 2. Configure Local Environment Variables

```bash
cp .dev.vars.example .dev.vars
```

By default, `.dev.vars.example` leaves `ADMIN_PASSWORD` empty, which automatically enables **Local Demo & Preview Mode** with pre-seeded accounts and a sample repository.

### 3. Start the Development Server

```bash
npm run dev
```

Open **`http://localhost:3000`** (or the Vite port printed in your terminal) in your browser.

### 4. Explore the Pre-Seeded Demo Accounts & Repositories

In local demo mode, visit **`/auth`** to use one-click demo buttons or sign in with:

| Account Role              | Handle / Username        | Password     | Pre-Seeded Workspace & Capabilities                                                                                                                                                                                                        |
| :------------------------ | :----------------------- | :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Site Administrator**    | `admin` (`@admin`)       | `admin123`   | Full access to Site Administration (`/admin/*`), User Directory (`/admin/users`), Global Repositories (`/admin/repositories`), Tokens (`/admin/tokens`), Instance Settings (`/admin/settings`), and Security Policies (`/admin/security`). |
| **Developer (Test User)** | `alex-dev` (`@alex-dev`) | `devuser123` | Access to Users Panel (`/user/profile`, `/user/account`, `/user/settings/tokens`), public profile (`/alex-dev`) with `.vibtools/profile/README.md`, and the GitHub-ready mock repository **`/alex-dev/cloud-forge-kit`**.                  |

---

## Using Git CLI (`clone`, `fetch`, `push`)

### Cloning a Public Repository

```bash
git clone http://localhost:3000/alex-dev/cloud-forge-kit.git
```

### Pushing to a Repository with a Personal Access Token (PAT)

1. Sign in at `/auth` (e.g. as `alex-dev`).
2. Navigate to **`/user/settings/tokens`** (_User Settings → Access Tokens_).
3. Create a token with **`push`** access level for namespace `@alex-dev` (or a specific repository) and copy the generated `goc_...` token.
4. Push from your terminal using your namespace handle as the HTTP Basic username and your `goc_...` PAT as the password:

```bash
cd my-project
git init -b main
git add .
git commit -m "Initial commit"

# Push using standard Git HTTP Basic credentials
git push http://alex-dev:<YOUR_GOC_PAT>@localhost:3000/alex-dev/my-repo.git main
```

> **Tip for Local Miniflare / Vite Dev Testing:**
> If local Miniflare intercepts a `401` challenge before Git prompts interactively, pass the Basic authorization header explicitly on the first push:
>
> ```bash
> AUTH_B64=$(printf "alex-dev:goc_your_token_here" | base64)
> git -c http.extraHeader="Authorization: Basic ${AUTH_B64}" \
>   push http://localhost:3000/alex-dev/my-repo.git HEAD:refs/heads/main
> ```

---

## Deploy to Cloudflare Workers

### 1. Authenticate Wrangler

```bash
npx wrangler login
```

### 2. Provision Cloudflare Resources (First-Time Setup)

Ensure your `wrangler.jsonc` references your Cloudflare account's **D1 Database** (`DB`), **R2 Bucket** (`REPO_BUCKET`), **KV Namespace** (`ROUTES`), and **Queue** (`REPO_TASKS_QUEUE`):

```bash
# Create resources if deploying to a fresh Cloudflare account
npx wrangler d1 create git-on-cloudflare
npx wrangler r2 bucket create git-repos
npx wrangler kv namespace create ROUTES
npx wrangler queues create git-on-cloudflare-repo-maint
```

Update the `database_id` and KV `id` in `wrangler.jsonc` to match your created resources.

### 3. Set Production Secrets

```bash
# Required: 32-byte hex secret used to sign browser session cookies
npx wrangler secret put SESSION_SECRET

# Required for production: disables demo login and sets the primary @admin password
npx wrangler secret put ADMIN_PASSWORD
```

### 4. Apply D1 Migrations & Deploy

```bash
npm run deploy
```

`npm run deploy` automatically runs remote D1 schema migrations (`wrangler d1 migrations apply git-on-cloudflare --remote`), builds the client & SSR bundles (`vite build`), and deploys the Worker (`wrangler deploy`).

---

## Configuration & Cloudflare Bindings

### Environment Variables (`.dev.vars` / Wrangler Secrets & Vars)

| Variable               | Required      | Default          | Description                                                                                             |
| :--------------------- | :------------ | :--------------- | :------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`       | **Yes**       | —                | Secret key used for HMAC-SHA256 browser session cookie signing.                                         |
| `ADMIN_USERNAME`       | No            | `admin`          | Primary administrator username/handle bootstrapped into D1.                                             |
| `ADMIN_PASSWORD`       | Prod: **Yes** | _(empty in dev)_ | Primary administrator password. When unset in local dev, enables Demo Mode (`admin123` / `devuser123`). |
| `REPO_DO_IDLE_MINUTES` | No            | `30`             | Minutes before an idle `RepoDurableObject` runs its cleanup alarm.                                      |
| `LOG_LEVEL`            | No            | `info`           | Structured logger verbosity (`debug`, `info`, `warn`, `error`).                                         |

### Platform Bindings (`wrangler.jsonc`)

| Binding Name       | Cloudflare Service       | Purpose                                                                                         |
| :----------------- | :----------------------- | :---------------------------------------------------------------------------------------------- |
| `REPO_DO`          | Durable Objects (SQLite) | `RepoDurableObject` — per-repository refs, HEAD, pack catalog, and receive lease authority.     |
| `DB`               | Cloudflare D1            | Global SQLite directory for users, namespaces, repository metadata, and Personal Access Tokens. |
| `REPO_BUCKET`      | Cloudflare R2            | Object storage bucket (`git-repos`) for `.pack`, `.idx`, and `.refs` files.                     |
| `ROUTES`           | Cloudflare KV            | Edge route cache for fast repository ownership and visibility lookups.                          |
| `REPO_TASKS_QUEUE` | Cloudflare Queues        | Background queue (`git-on-cloudflare-repo-maint`) for compaction, cache sync, and purge tasks.  |
| `ASSETS`           | Workers Static Assets    | Serves compiled Vite client island bundles from `dist/client` (`html_handling: "none"`).        |

---

## HTTP Routes & API Reference

### Git Smart HTTP v2 Endpoints

| Method | Path                             | Auth                         | Description                                                                 |
| :----- | :------------------------------- | :--------------------------- | :-------------------------------------------------------------------------- |
| `GET`  | `/:owner/:repo/info/refs`        | Public or Basic PAT          | Git v2 capability advertisement for `git-upload-pack` & `git-receive-pack`. |
| `POST` | `/:owner/:repo/git-upload-pack`  | Public or Basic PAT (`pull`) | Git v2 `ls-refs` and streaming `fetch` pack negotiation.                    |
| `POST` | `/:owner/:repo/git-receive-pack` | Basic PAT (`push`)           | Streaming pack receive, connectivity check, and atomic ref update.          |

### Web UI & Developer Workspace Routes

| Method | Path                        | Access              | Description                                                                                    |
| :----- | :-------------------------- | :------------------ | :--------------------------------------------------------------------------------------------- |
| `GET`  | `/` and `/explore`          | Public              | Home landing page and searchable public repository directory.                                  |
| `GET`  | `/:owner`                   | Public              | Owner profile (`Overview` with `.vibtools/profile/README.md` & `Pinned` + `Repositories` tab). |
| `GET`  | `/:owner/:repo`             | Public / Member     | Repository overview (`<> Code`), file tree table, `README.md`, and clone drawer.               |
| `GET`  | `/:owner/:repo/tree`        | Public / Member     | Directory browser (`?ref=<branch>&path=<dir>`).                                                |
| `GET`  | `/:owner/:repo/blob`        | Public / Member     | Syntax-highlighted file viewer & in-browser file editor (`?ref=<branch>&path=<file>`).         |
| `GET`  | `/:owner/:repo/commits`     | Public / Member     | Commit history log (`?ref=<branch>`) with merge side-branch expansion.                         |
| `GET`  | `/:owner/:repo/commit/:oid` | Public / Member     | Single commit metadata and unified diff viewer.                                                |
| `GET`  | `/:owner/:repo/raw`         | Public / Member     | Safe `text/plain` raw blob view by OID (`?oid=<sha>`).                                         |
| `GET`  | `/:owner/:repo/rawpath`     | Same-Origin Referer | Same-origin protected raw file stream by ref and path (`?ref=...&path=...`).                   |
| `GET`  | `/:owner/:repo/admin`       | Repo Owner / Admin  | Repository settings, HEAD/ref editor, pack catalog, compaction, and purge controls.            |

### Auth, User Panel & Site Administration Routes

| Method | Path                                                                                                   | Access           | Description                                                                 |
| :----- | :----------------------------------------------------------------------------------------------------- | :--------------- | :-------------------------------------------------------------------------- |
| `GET`  | `/auth`                                                                                                | Public           | Sign-in page (plus Quick Demo Login & Demo User Panel buttons in dev mode). |
| `POST` | `/auth/login`, `/auth/logout`, `/auth/demo-login`                                                      | Public / Session | Session authentication and sign-out endpoints.                              |
| `GET`  | `/user/profile`, `/user/account`, `/user/settings`, `/user/settings/security`, `/user/settings/tokens` | Signed-in User   | Dedicated User Settings Panel (`/user/*`).                                  |
| `GET`  | `/admin`, `/admin/users`, `/admin/repositories`, `/admin/tokens`, `/admin/settings`, `/admin/security` | `admin` Role     | Global Site Administration Control Panel (`/admin/*`).                      |

For full request/response payload schemas, see [`docs/api-endpoints.md`](./docs/api-endpoints.md).

---

## Project Directory Structure

```text
git-on-cloudflare/
├── .github/                  # GitHub Issue and Pull Request templates
├── docs/                     # Deep-dive architecture, storage, caching, and API documentation
├── drizzle/                  # Generated SQL migrations for D1 (drizzle/d1) and Repo DO (drizzle/repo-do)
├── notes/                    # Engineering audit, phased roadmap, error handling & implementation logs
├── src/
│   ├── client/
│   │   ├── components/       # Shared SSR React components (Header, RepoNav, User/Admin layouts, UI primitives)
│   │   ├── entries/          # Vite client hydration entrypoints
│   │   ├── islands/          # Focused interactive client islands (profile, tokens, repo editor, admin)
│   │   ├── pages/            # Route-level React 19 SSR pages
│   │   ├── server/           # SSR document shell, view registry, markdown renderer & typed error boundary
│   │   └── styles/           # Tailwind CSS v4 design tokens and cool-slate theme variables
│   ├── shared/               # Browser-safe formatting, slug validation, HTTP, and RBAC helpers
│   └── worker/
│       ├── auth/             # Session signing, PBKDF2 passwords, PAT hashing, Git Basic auth & demo seed
│       ├── cache/            # Edge cache policies and cache-key builders
│       ├── common/           # Structured logger, compression, byte/hex utilities, and DO stubs
│       ├── db/d1/            # Cloudflare D1 Drizzle schema, bootstrap, and Data Access Layer (DAL)
│       ├── do/repo/          # RepoDurableObject, receive leases, compaction, storage & SQLite DAL
│       ├── git/              # Git Smart HTTP v2 core protocol, pack assembly, indexer & Limiter
│       ├── routes/           # Hono route modules (git, auth, user, admin, systemAdmin, UI SSR)
│       ├── tasks/            # Cloudflare Queues background consumer (compaction, cache-sync, delete)
│       └── index.ts          # Main Cloudflare Worker entrypoint, router registration & error boundary
├── test/                     # Vitest Node unit tests (*.test.ts) and Cloudflare Worker integration tests (*.worker.test.ts)
├── .dev.vars.example         # Local environment variable template
├── AGENTS.md                 # Repository engineering rules and architectural invariants
├── CHANGELOG.md              # Project release and milestone changelog
├── CODE_OF_CONDUCT.md        # Community code of conduct
├── CONTRIBUTING.md           # Developer contribution guidelines
├── LICENSE                   # MIT License
├── SECURITY.md               # Security architecture and vulnerability reporting policy
├── SUPPORT.md                # Support channels and troubleshooting guide
├── package.json              # Scripts and dependencies
└── wrangler.jsonc            # Cloudflare Workers bindings, migrations, and runtime configuration
```

---

## Development, Testing & Validation Commands

```bash
# Start local development server (Vite + Cloudflare Workers SSR)
npm run dev

# Build production client and Worker bundles
npm run build

# Regenerate Cloudflare runtime types and run TypeScript strict typecheck
npm run typecheck

# Check formatting across the entire repository with Prettier
npm run format:check

# Auto-format all files with Prettier
npm run format

# Run fast Node unit tests (vitest.unit.config.ts)
npm run test

# Run Cloudflare Workers integration tests (@cloudflare/vitest-pool-workers)
npm run test:workers

# Run targeted worker integration suites
npx vitest run --config vitest.config.ts test/github-feel.worker.test.ts
npx vitest run --config vitest.config.ts test/demo-user-mock-repo.worker.test.ts
npx vitest run --config vitest.config.ts test/system-admin.worker.test.ts
npx vitest run --config vitest.config.ts test/git-acl.worker.test.ts
npx vitest run --config vitest.config.ts test/error-boundary.worker.test.ts

# Generate Drizzle migrations after editing src/worker/do/repo/db/schema.ts or src/worker/db/d1/schema.ts
npm run db:generate
```

---

## Known Platform Constraints

- **HTTPS Git Smart HTTP v2 Only:** Cloudflare Workers handle HTTP(S) traffic at the edge; SSH transport (`git@...:owner/repo.git`) is not supported. Use HTTPS URLs with `goc_...` Personal Access Tokens.
- **Worker Request CPU & Subrequest Budgets:** Each request operates within Cloudflare Workers CPU limits (`limits.cpu_ms = 300000` in `wrangler.jsonc`) and the 1,000-subrequest platform ceiling (managed automatically by `Limiter`).
- **Thick Pack Transfer:** `thin-pack` capability is intentionally not advertised so clients send and receive self-contained packs (`side-band-64k`, `ofs-delta`).
- **Focused Code Forge Scope:** Built for fast Git hosting, code browsing, web file editing, `.vibtools` developer profiles, PAT authentication, and instance administration; does not bundle heavy CI runners or issue/PR workflow engines.

---

## Documentation Index

### Architecture & Operations (`docs/`)

- **[API Endpoints Reference](./docs/api-endpoints.md)** — Complete HTTP route and payload reference.
- **[Architecture Overview](./docs/architecture.md)** — Subsystem boundaries and request lifecycle.
- **[Hybrid Storage Model](./docs/storage.md)** — Durable Object SQLite + R2 pack storage design.
- **[Data Flows](./docs/data-flows.md)** — End-to-end `git push`, `git fetch`, and SSR UI rendering flows.
- **[Caching Strategy](./docs/caching.md)** — Two-tier edge caching and invalidation model.
- **[Diff Rendering](./docs/diff.md)** — Commit diff and merge-commit expansion internals.
- **[Streaming Push Guide](./MIGRATION-STREAMING-PUSH.md)** — Streaming receive pipeline architecture and upgrade notes.
- **[Ownership & Auth Migration Guide](./MIGRATION-TESSERA-OIDC.md)** — D1 directory ownership and PAT migration notes.

### Engineering & Governance

- **[Contributing Guide](./CONTRIBUTING.md)** — How to set up, test, and submit pull requests.
- **[Security Policy](./SECURITY.md)** — Security controls and private vulnerability disclosure.
- **[Support Guide](./SUPPORT.md)** — Where to get help, report bugs, or contact Vib Tools.
- **[Changelog](./CHANGELOG.md)** — Detailed release history and production upgrade log.
- **[Code of Conduct](./CODE_OF_CONDUCT.md)** — Community standards and expectations.
- **[Engineering Notes (`notes/`)](./notes/00-INDEX-AND-WORKFLOW.md)** — Forensic audit, scope locks, error handling matrix, and phase completion logs.

---

## Author, Maintainer & Official Contact Information

### About Vib Tools

**Vib Tools** (`Vib.Tools` / `vibtools`) is a software organization focused on building **practical desktop applications, self-hosted software, automation tooling, developer utilities, reusable frameworks, and open-source projects for real workflows**.

> **Mission:** _Build free and open-source tools that help people do real work with less complexity._  
> **Taglines:** _Practical software for real workflows._ · _Free Open-Source Tools for Developers and Teams._ · _Build Useful Tools. Share Them Openly._

### Maintainer Identity

- **Organization / Brand:** [Vib Tools](https://vibtools.io/) ([https://vib.tools/](https://vib.tools/))
- **Connected GitHub Organization & Maintainer Account:** [Vib Tools (`@vibtoolshq`)](https://github.com/vibtoolshq)  
  _(Vib Tools is the connected GitHub account holder associated with maintaining and administering Vib Tools repositories.)_

### Official Contact Channels

| Channel                         | Contact / Destination                                                          | Purpose                                                                                 |
| :------------------------------ | :----------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **Official Website**            | [https://vibtools.io/](https://vibtools.io/) ([vib.tools](https://vib.tools/)) | Official product catalog, status updates, and company overview                          |
| **GitHub Organization**         | [https://github.com/vibtoolshq](https://github.com/vibtoolshq)                 | Public source repositories, issues, and pull requests                                   |
| **GitLab Organization**         | [https://gitlab.com/vibtools](https://gitlab.com/vibtools)                     | GitLab organization profile (`@vibtools`)                                               |
| **General Inquiries**           | [hello@vibtools.io](mailto:hello@vibtools.io)                                  | Partnerships, press/media, company inquiries, and general questions                     |
| **Product & Technical Support** | [support@vibtools.io](mailto:support@vibtools.io)                              | Technical support for Vib Tools products, public projects, and private security reports |
| **Phone / WhatsApp**            | `+880 1795-470603` (`+8801795470603`)                                          | Direct phone & WhatsApp contact (Bangladesh, GMT+6 / Asia-Dhaka business context)       |
| **Head Office**                 | **Vib Tools HQ**, 5660 Kochakata, Nageswari, Kurigram, Rangpur, Bangladesh     | Official physical head office address                                                   |

### Official Social & Community Profiles

- **Website:** [https://vibtools.io/](https://vibtools.io/) · [https://vib.tools/](https://vib.tools/)
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

This repository is licensed under the **[MIT License](./LICENSE)**. Always check individual repository [`LICENSE`](./LICENSE), [`SECURITY.md`](./SECURITY.md), and [`CONTRIBUTING.md`](./CONTRIBUTING.md) files before making legal or distribution claims.
