# Contributing to `git-on-cloudflare`

Thank you for your interest in contributing to **`git-on-cloudflare`**, maintained by **[Vib Tools](https://vibtools.io/)** ([`@vibtoolshq`](https://github.com/vibtoolshq)).

Vib Tools builds practical, inspectable, and maintainable software for real workflows (_Build Useful Tools. Share Them Openly._). We welcome focused bug fixes, performance improvements, documentation updates, and well-tested features that respect the repository's edge-native architecture.

---

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Core Architectural Rules & Invariants](#core-architectural-rules--invariants)
3. [Local Development Setup](#local-development-setup)
4. [Database Schema & Migrations Workflow](#database-schema--migrations-workflow)
5. [UI & Client Islands Conventions](#ui--client-islands-conventions)
6. [Validation & Testing Matrix](#validation--testing-matrix)
7. [Pull Request Checklist](#pull-request-checklist)
8. [Contact & Support Channels](#contact--support-channels)

---

## Before You Start

1. **Read the Repository Documentation:** Review [`README.md`](./README.md), [`AGENTS.md`](./AGENTS.md), and the architecture guides under [`docs/`](./docs/) to understand how the Worker, `RepoDurableObject`, R2, D1, KV, and Queues interact.
2. **Check Existing Issues & Discussions:** Search existing [GitHub Issues](https://github.com/vibtoolshq/git-on-cloudflare/issues) before opening a duplicate report or starting a major refactor.
3. **Keep Changes Focused:** Prefer narrow, well-scoped pull requests in the subsystem that owns the behavior rather than broad cross-layer rewrites.

---

## Core Architectural Rules & Invariants

Every contribution must uphold the core engineering rules defined in [`AGENTS.md`](./AGENTS.md):

1. **Single-Hop Runtime Boundaries (No Transitive Chaining):**
   - Keep cross-runtime calls to a single hop from the caller: `Workers -> DO`, `Workers -> R2`, `Workers -> D1`, or `DO -> R2`.
   - Avoid chaining boundaries transitively (such as `Workers -> DO -> R2` on request paths) and never design distributed transactions across Workers and Durable Objects.
2. **Transactional Authority in Durable Objects:**
   - `RepoDurableObject` is the single source of truth for a repository's refs, HEAD, receive leases, and pack catalog.
   - Durable Objects communicate outcomes to Workers via **tagged unions** rather than throwing exceptions for expected domain outcomes.
   - Never use `blockConcurrencyWhile` inside a Durable Object RPC handler.
3. **Mandatory `Limiter` on Platform Calls:**
   - Every request-scoped R2 read/write and outbound Durable Object RPC must go through `Limiter` (`src/worker/git/operations/limits.ts`) via `limiter.run("r2:...", fn)` or `limiter.run("do:...", fn)`.
   - Respect Cloudflare's 1,000-subrequest and 6-concurrent-connection limits (`DEFAULT_SUBREQUEST_BUDGET = 900`).
4. **No Ad-Hoc Raw SQL Outside the DAL:**
   - All repository SQLite queries must live in `src/worker/do/repo/db/dal.ts`.
   - All Cloudflare D1 queries must live in `src/worker/db/d1/dal/*`.
5. **Strict TypeScript — Zero `any` or Unnecessary Casting:**
   - Reuse canonical types and helpers from `src/worker/git/core/objects.ts`, `src/worker/common/hex.ts`, `src/shared/slugs.ts`, and `src/shared/admin/panel.ts`.
   - Do not introduce `as any`, `ReturnType<>`, or duplicate helper functions.
6. **Structured Visibility Logging:**
   - Non-trivial code paths touching R2, DO RPC, D1, or background queues must log via `createLogger` (`src/worker/common/logger.ts`) using kebab-case component-scoped message identifiers (e.g., `"receive:finalize-committed"`).
7. **Route Registration Order:**
   - In `src/worker/index.ts`, `registerAuthRoutes`, `registerSystemAdminRoutes`, `registerAdminRoutes`, and `registerGitRoutes` **must** remain registered before `registerUiRoutes` so `/auth/*`, `/user/*`, `/admin/*`, and Git protocol routes are never shadowed by `/:owner` or `/:owner/:repo`.

---

## Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/vibtoolshq/git-on-cloudflare.git
cd git-on-cloudflare

# 2. Install dependencies
npm install

# 3. Copy local development variables
cp .dev.vars.example .dev.vars

# 4. Start the local development server
npm run dev
```

- When `ADMIN_PASSWORD` is left blank in `.dev.vars`, local Demo Mode is active (`@admin` / `admin123` and `@alex-dev` / `devuser123` with the seeded `alex-dev/cloud-forge-kit` repository).

---

## Database Schema & Migrations Workflow

- **Never edit generated SQL migration files under `drizzle/repo-do/` or `drizzle/d1/` by hand.**
- Treat `src/worker/do/repo/db/schema.ts` (Repo Durable Object SQLite) and `src/worker/db/d1/schema.ts` (Cloudflare D1) as the sources of truth.
- After modifying a schema file, generate the corresponding migration and run typechecking:

```bash
npm run db:generate
npm run typecheck
```

---

## UI & Client Islands Conventions

- **Design Context:** Read [`PRODUCT.md`](./PRODUCT.md) before changing visual layout or typography.
- **Typography & Palette:**
  - UI Sans: `Hanken Grotesk` (`--font-sans`)
  - Code / Monospace: `JetBrains Mono` (`--font-mono`) — use `font-mono` strictly for commit OIDs, refs, paths, clone URLs, PAT prefixes, algorithms, and code blocks; never use `font-mono` for ordinary numeric counters or prose labels.
  - Palette: Dark-first cool-slate (`#0d1117` canvas, `#161b22` surface, `#010409` header, `#30363d` border) with light-mode parity and unified `rounded-md` (`6px`) component radii.
- **SSR + Islands:**
  - All HTML pages render server-side through `renderUiDocumentResponse` and `src/client/server/registry.tsx`.
  - Keep client-side interactivity inside focused islands under `src/client/islands/` mounted via `IslandHost`.
  - Never use `window.alert` or `window.open`; always render inline accessible status/error banners (`role="alert"`).

---

## Validation & Testing Matrix

Run the smallest complete set of validation commands matching your change before opening a pull request:

| Change Area                                        | Required Validation Commands                                                                                                                             |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Formatting (All Changes)**                       | `npm run format:check` (run `npm run format` to fix)                                                                                                     |
| **TypeScript & Wrangler Types (All Code Changes)** | `npm run typecheck`                                                                                                                                      |
| **Pure Parsing / Formatting / Helper Logic**       | `npm run test` (`vitest.unit.config.ts`)                                                                                                                 |
| **Auth, Sessions, PATs, or `/user/*`**             | `npm run test:auth` + `npx vitest run --config vitest.config.ts test/demo-user-mock-repo.worker.test.ts test/d1-session.worker.test.ts`                  |
| **Admin Control Panel (`/admin/*`)**               | `npx vitest run --config vitest.config.ts test/system-admin.worker.test.ts`                                                                              |
| **Public Profile (`/:owner`) or `.vibtools`**      | `npx vitest run --config vitest.config.ts test/vibtools-profile.worker.test.ts test/github-feel.worker.test.ts`                                          |
| **Git Smart HTTP, Pack Storage, or Repo UI**       | `npx vitest run --config vitest.config.ts test/git-acl.worker.test.ts test/streaming-receive.worker.test.ts test/pack-first-fetch-and-ui.worker.test.ts` |
| **Error Boundaries & SSR Fallbacks**               | `npx vitest run --config vitest.config.ts test/error-boundary.worker.test.ts`                                                                            |

---

## Pull Request Checklist

- [ ] Code compiles cleanly and passes `npm run typecheck`.
- [ ] All files are formatted with Prettier (`npm run format:check`).
- [ ] Unit tests and relevant Cloudflare Worker integration tests pass.
- [ ] Comments and JSDoc match the updated behavior (no outdated comments or `"Phase 1/2/3"` milestone markers left in `src/`).
- [ ] Security invariants (CSRF checks, RBAC gates, non-disclosure `404` on private repos, HTML escaping) remain intact.

---

## Contact & Support Channels

- **General Inquiries:** [hello@vibtools.io](mailto:hello@vibtools.io)
- **Technical & Product Support:** [support@vibtools.io](mailto:support@vibtools.io)
- **Security Vulnerabilities:** Please follow [`SECURITY.md`](./SECURITY.md) and report privately to [support@vibtools.io](mailto:support@vibtools.io).
- **Official Website:** [https://vibtools.io/](https://vibtools.io/)
- **GitHub Organization:** [https://github.com/vibtoolshq](https://github.com/vibtoolshq)
