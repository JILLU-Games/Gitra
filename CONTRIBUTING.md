# Contributing to Gitra

Thank you for your interest in contributing to **Gitra** ([gitra.co](https://gitra.co/)), an open-source serverless Git forge on Cloudflare Workers maintained by **[Vib Tools](https://vib.tools/)** ([`@vibtoolshq`](https://github.com/vibtoolshq)).

Vib Tools builds practical, inspectable, and maintainable software for real workflows (_Build Useful Tools. Share Them Openly._). We welcome focused bug fixes, performance improvements, documentation updates, and well-tested features that respect Gitra's edge-native architecture.

---

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Core Architectural Rules & Invariants](#core-architectural-rules--invariants)
3. [Local Development Setup](#local-development-setup)
4. [Database Schema & Migrations Workflow](#database-schema--migrations-workflow)
5. [UI, Theme & Client Islands Conventions](#ui-theme--client-islands-conventions)
6. [Validation & Testing Matrix](#validation--testing-matrix)
7. [Pull Request Checklist](#pull-request-checklist)
8. [Contact & Support Channels](#contact--support-channels)

---

## Before You Start

1. **Read the Repository Documentation:** Review [`README.md`](./README.md), [`AGENTS.md`](./AGENTS.md), [`PRODUCT.md`](./PRODUCT.md), and the architecture guides under [`docs/`](./docs/).
2. **Check Existing Issues:** Search [GitHub Issues](https://github.com/vibtoolshq/gitra/issues) before opening a duplicate report or starting a large refactor.
3. **Keep Pull Requests Focused:** Submit narrow, well-scoped changes in the subsystem that owns the behavior rather than broad cross-layer rewrites.

---

## Core Architectural Rules & Invariants

Every contribution must preserve the architectural invariants in [`AGENTS.md`](./AGENTS.md):

1. **Single-Hop Runtime Boundaries:**
   - Keep cross-runtime calls to a single hop: `Workers -> DO`, `Workers -> R2`, `Workers -> D1`, or `DO -> R2`.
   - Never chain transitive mutations (e.g., `Workers -> DO -> R2` on request paths) or simulate distributed transactions across Workers and Durable Objects.
2. **Transactional Authority in `RepoDurableObject`:**
   - `RepoDurableObject` is the single source of truth for a repository's refs, `HEAD`, receive leases, and pack catalog.
   - Return typed tagged unions from DO RPCs instead of throwing for expected outcomes, and never use `blockConcurrencyWhile` inside RPC handlers.
3. **Mandatory `Limiter` on Platform Calls:**
   - Every request-scoped R2 read/write and outbound Durable Object RPC must go through `Limiter` (`src/worker/git/operations/limits.ts`) via `limiter.run("r2:...", fn)` or `limiter.run("do:...", fn)`.
   - Respect Cloudflare's 1,000-subrequest and 6-concurrent-connection ceilings (`DEFAULT_SUBREQUEST_BUDGET = 900`).
4. **Free & Paid Tier Compatibility:**
   - Guard optional Queue operations through `src/worker/tasks/dispatch.ts` and background compaction triggers through `shouldAutoQueueBackgroundCompaction` (`src/worker/common/tier.ts`).
   - Keep `wrangler.jsonc` and `wrangler.paid.jsonc` clean of real account UUIDs, KV IDs, or hardcoded production domains.
5. **Strict Data Access Layers (DAL):**
   - Repository SQLite queries belong exclusively in `src/worker/do/repo/db/dal.ts`.
   - Cloudflare D1 queries belong exclusively in `src/worker/db/d1/dal/*`.
6. **Strict TypeScript — Zero `any` or Unnecessary Casting:**
   - Reuse canonical types and helpers (`src/worker/git/core/objects.ts`, `src/worker/common/hex.ts`, `src/shared/slugs.ts`, `src/shared/branding.ts`, `src/shared/admin/panel.ts`).
7. **Structured Visibility Logging:**
   - Non-trivial paths touching R2, DO RPC, D1, or background tasks must log via `createLogger` (`src/worker/common/logger.ts`) with kebab-case component-scoped identifiers.
8. **Route Registration Order:**
   - Keep `registerAuthRoutes`, `registerSystemAdminRoutes`, `registerAdminRoutes`, and `registerGitRoutes` registered before `registerUiRoutes` in `src/worker/index.ts` so `/auth/*`, `/user/*`, `/admin/*`, `/namespaces`, and Git protocol routes are never shadowed by `/:owner` or `/:owner/:repo`.

---

## Local Development Setup

```bash
# 1. Clone Gitra
git clone https://github.com/vibtoolshq/gitra.git
cd gitra

# 2. Install dependencies
npm install

# 3. Copy local development variables
cp .dev.vars.example .dev.vars

# 4. Start the local development server
npm run dev
```

When `ADMIN_PASSWORD` is left blank in `.dev.vars`, local Demo Mode seeds `@admin` (`admin123`) and `@alex-dev` (`devuser123`) with `/alex-dev/cloud-forge-kit`.

---

## Database Schema & Migrations Workflow

- **Never edit generated migration SQL files under `drizzle/repo-do/` or `drizzle/d1/` by hand.**
- Edit `src/worker/do/repo/db/schema.ts` (Repo DO SQLite) or `src/worker/db/d1/schema.ts` (Cloudflare D1), then regenerate and typecheck:

```bash
npm run db:generate
npm run typecheck
```

---

## UI, Theme & Client Islands Conventions

- Read [`PRODUCT.md`](./PRODUCT.md) before modifying layout, typography, or surface tokens.
- Keep HTML rendering server-side via `renderUiDocumentResponse` and `src/client/server/registry.tsx`.
- Keep interactive client code inside focused islands under `src/client/islands/` mounted through `IslandHost`.
- Maintain full Dark & Light theme parity using the semantic CSS tokens in `src/client/styles/app.css`.
- Never use `window.alert` or `window.open`; render accessible inline status/error feedback (`role="alert"`).

---

## Validation & Testing Matrix

Run the smallest complete validation set covering your change before opening a pull request:

| Change Area                                     | Validation Commands                                                                                                                                      |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Formatting (All Changes)**                    | `npm run format:check` (fix with `npm run format`)                                                                                                       |
| **TypeScript & Wrangler Types**                 | `npm run typecheck`                                                                                                                                      |
| **Pure Parsing, Tier & Auto-Deploy Logic**      | `npm run test` + `npx tsx --test test/cloudflare-tier.node-test.ts test/cf-auto-deploy.node-test.ts`                                                     |
| **Auth, Sessions, PATs, or `/user/*`**          | `npm run test:auth` + `npx vitest run --config vitest.config.ts test/d1-session.worker.test.ts`                                                          |
| **Admin Panel (`/admin/*`) & Branding**         | `npx vitest run --config vitest.config.ts test/system-admin.worker.test.ts`                                                                              |
| **Public Profiles (`/:owner`) & `/namespaces`** | `npx vitest run --config vitest.config.ts test/vibtools-profile.worker.test.ts test/github-feel.worker.test.ts`                                          |
| **Git Smart HTTP, Pack Engine, or Repo UI**     | `npx vitest run --config vitest.config.ts test/git-acl.worker.test.ts test/streaming-receive.worker.test.ts test/pack-first-fetch-and-ui.worker.test.ts` |
| **Error Boundaries & SSR Fallbacks**            | `npx vitest run --config vitest.config.ts test/error-boundary.worker.test.ts`                                                                            |

---

## Pull Request Checklist

- [ ] Code builds cleanly (`npm run build`) and passes `npm run typecheck`.
- [ ] Formatting passes Prettier (`npm run format:check`).
- [ ] Unit tests and relevant Cloudflare Worker integration tests pass.
- [ ] Comments and documentation stay in sync with the code (no stale milestone markers).
- [ ] Security invariants (CSRF checks, RBAC gates, non-disclosure `404` on private repos, HTML escaping) remain intact.

---

## Contact & Support Channels

- **Gitra Website:** [https://gitra.co/](https://gitra.co/)
- **Vib Tools Website:** [https://vib.tools/](https://vib.tools/)
- **GitHub Organization:** [https://github.com/vibtoolshq](https://github.com/vibtoolshq)
- **General Inquiries:** [hello@vibtools.io](mailto:hello@vibtools.io)
- **Product & Technical Support:** [support@vibtools.io](mailto:support@vibtools.io)
- **Private Security Disclosure:** Follow [`SECURITY.md`](./SECURITY.md) and email [support@vibtools.io](mailto:support@vibtools.io)
