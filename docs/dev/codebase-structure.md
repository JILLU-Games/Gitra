---
title: Codebase Structure
description: Verified directory and module map of the Gitra codebase across Worker, Client SSR/Islands, Shared utilities, Scripts, Migrations, and Tests.
order: 2
draft: false
---

# Codebase Structure

This map reflects the live workspace tree (439 source, script, migration, and test files verified at audit time).

---

## Top-Level Layout

```text
.
├── src/
│   ├── worker/              # Cloudflare Worker backend (Hono routes, DO, D1, Git engine, auth, tasks)
│   ├── client/              # React 19 SSR pages, shared components, client islands & Vite entries
│   └── shared/              # Browser- and Worker-safe shared modules (branding, slugs, RBAC helpers, web utils)
├── scripts/                 # Cloudflare zero-touch auto-deploy & manual setup scripts
├── drizzle/
│   ├── d1/                  # Generated SQL migrations for Cloudflare D1 (DB)
│   └── repo-do/             # Generated SQL migrations for RepoDurableObject SQLite
├── test/                    # Vitest unit tests, node:test suites, and Cloudflare Workers pool tests
├── docs/                    # Project documentation suite
├── .github/                 # GitHub Actions deploy workflow, PR & issue templates
├── wrangler.jsonc           # Free-tier Wrangler template (no hardcoded production IDs/domains)
├── wrangler.paid.jsonc      # Paid-tier Wrangler template (+ Cloudflare Queues binding)
├── vite.config.ts           # Vite + @cloudflare/vite-plugin + Tailwind v4 build config
├── vitest.config.ts         # Cloudflare Workers integration test config
├── vitest.unit.config.ts    # Node unit test config
├── drizzle-d1.config.ts     # Drizzle Kit config for D1
├── drizzle-repo-do.config.ts# Drizzle Kit config for Repo DO SQLite
├── .dev.vars.example        # Local Worker env var template
└── .env.deploy.example      # Zero-touch auto-deploy env var template
```

---

## `src/worker/` — Cloudflare Worker Backend

| Path                       | Responsibility                                                                                                                                 | Key Files                                                                                                                                                                   |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/worker/index.ts`      | Worker entry point: exports default Hono `fetch`, `queue` consumer, and `RepoDurableObject` class; registers routes in strict order            | `index.ts`                                                                                                                                                                  |
| `src/worker/routes/`       | HTTP & JSON route handlers, Hono context typing, Zod request schemas                                                                           | `hono.ts`, `git.ts`, `admin.ts`, `auth.ts`, `authLogin.ts`, `authTokens.ts`, `authRepositories.ts`, `authShared.ts`, `systemAdmin.ts`, `ui.ts`, `ui/*`, `requestSchemas.ts` |
| `src/worker/auth/`         | Authentication, cookies, passwords, PATs, CSRF origin, rate limiting, Demo seeding                                                             | `adminAuth.ts`, `session.ts`, `cookies.ts`, `passwords.ts`, `pat.ts`, `gitAuth.ts`, `origin.ts`, `rateLimit.ts`, `demoSeed.ts`                                              |
| `src/worker/db/d1/`        | D1 Drizzle client, once-per-isolate bootstrapper, 11 schema tables, and DAL modules                                                            | `client.ts`, `bootstrap.ts`, `schema/*`, `dal/*`                                                                                                                            |
| `src/worker/do/repo/`      | `RepoDurableObject` class, refs/HEAD state, receive & compaction leases, SQLite `pack_catalog` DAL, maintenance & debug                        | `repoDO.ts`, `catalog.ts`, `refs.ts`, `maintenance.ts`, `packOperations.ts`, `debug.ts`, `db/schema.ts`, `db/dal/`                                                          |
| `src/worker/git/`          | Pure Git Smart HTTP v2 protocol engine, streaming receive-pack, streaming upload-pack, pack-first object store, commit diffs, web file commits | `core/*`, `object-store/*`, `operations/*`, `pack/*`, `receive/*`, `commitFile.ts`                                                                                          |
| `src/worker/cache/`        | Two-tier Workers Cache API helpers (`git-on-cf:json`, `git-on-cf:objects`) and private-request isolation policy                                | `cache.ts`, `policy.ts`                                                                                                                                                     |
| `src/worker/repositories/` | Route resolution (KV candidate cache + D1 authoritative fallback) and branch cache                                                             | `route.ts`, `routeCache.ts`                                                                                                                                                 |
| `src/worker/tasks/`        | Queue consumer (`handleRepoTaskQueue`) and Free/Paid tier task dispatcher                                                                      | `queue.ts`, `dispatch.ts`, `types.ts`, `compaction.ts`, `refBackfill.ts`, `routeCacheSync.ts`, `repositoryDelete.ts`                                                        |
| `src/worker/common/`       | Tier resolution, structured JSON logger, compression, OID/hex helpers, DO stubs, response helpers                                              | `tier.ts`, `logger.ts`, `hex.ts`, `compression.ts`, `response.ts`, `stub.ts`                                                                                                |
| `src/worker/branding.ts`   | Live KV branding loader/saver (`site:branding:v1`) and R2 site-asset helpers (`site-assets/*`)                                                 | `branding.ts`                                                                                                                                                               |
| `src/worker/keys.ts`       | Canonical R2 & DO key prefix helpers (`do/<doId>/objects/pack/...`)                                                                            | `keys.ts`                                                                                                                                                                   |

---

## `src/client/` — React 19 SSR & Client Islands

| Path                     | Responsibility                                                                               | Key Files                                                                                                                                                                                                                                                                                                                                    |
| :----------------------- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/server/`     | SSR document shell, `renderToReadableStream()` renderer, view registry, viewer/error helpers | `registry.tsx`, `render.tsx`, `document.tsx`, `viewer.ts`, `error.ts`                                                                                                                                                                                                                                                                        |
| `src/client/pages/`      | Route-level React 19 SSR page components                                                     | `HomePage.tsx`, `NamespacesPage.tsx`, `OwnerPage.tsx`, `OverviewPage.tsx`, `TreePage.tsx`, `BlobPage.tsx`, `CommitsPage.tsx`, `CommitPage.tsx`, `AuthSignInPage.tsx`, `AccountPage.tsx`, `AdminPage.tsx`, `SystemAdminPage.tsx`, `AdminUsersPage.tsx`, `AdminSettingsPage.tsx`, `AdminSecurityPage.tsx`, `NotFoundPage.tsx`, `ErrorPage.tsx` |
| `src/client/components/` | Reusable SSR layout & chrome components (Header, Footer, AppLayout, Markdown, navigation)    | `AppLayout.tsx`, `header.tsx`, `footer.tsx`, ...                                                                                                                                                                                                                                                                                             |
| `src/client/islands/`    | Focused browser-only interactive modules hydrated per page                                   | Account, Admin, Branding Studio, Blob Editor, Commit Diff Expander, Repo Nav islands                                                                                                                                                                                                                                                         |
| `src/client/entries/`    | 14 Vite client entrypoints registered in `src/client/entrypoints.ts`                         | `styles.ts`, `shell.ts`, `home-page.ts`, `owner-page.ts`, `overview-page.ts`, `tree-page.ts`, `blob-page.ts`, `commit-page.ts`, `commits-page.ts`, `admin-page.ts`, `system-admin-page.ts`, `admin-users-page.ts`, `admin-settings-page.ts`, `account-page.ts`                                                                               |
| `src/client/styles.css`  | Root stylesheet importing `src/client/styles/app.css` (Tailwind CSS v4)                      | `styles.css`, `styles/app.css`                                                                                                                                                                                                                                                                                                               |

---

## `src/shared/` — Isomorphic Shared Modules

| File                        | Responsibility                                                                                                                                                                                                |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/branding.ts`    | `DEFAULT_SITE_BRANDING` (Gitra defaults), URL/email sanitization, `MAX_BRANDING_ASSET_BYTES`, and magic-byte image validation                                                                                 |
| `src/shared/slugs.ts`       | Namespace & repository slug validation, `RESERVED_SLUGS`, `.vibtools` (`PROFILE_REPO_SLUG`) & `PROFILE_README_CANDIDATES`                                                                                     |
| `src/shared/admin/panel.ts` | RBAC capability checks (`canAccessAdminPanel`, `canWriteRepositories`, `canIssueGlobalPat`), primary-admin patch guardrails, repository patch policy, temporary CSPRNG password generator, and metric helpers |
| `src/shared/web/`           | Request JSON parser, MIME detection, ref/path/OID validation, formatting utilities                                                                                                                            |

---

## `scripts/` — Deployment & Provisioning Scripts

| File                             | Responsibility                                                                                                                             |
| :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/cf-auto-deploy.mjs`     | Zero-touch, idempotent Cloudflare Free/Paid deployment CLI (`npm run deploy:auto`)                                                         |
| `scripts/cf-auto-deploy-lib.mjs` | Pure, unit-tested helpers for `.env.deploy` parsing, config merging, secret preservation, and `.wrangler/deploy.generated.jsonc` rendering |
| `scripts/cloudflare-setup.mjs`   | Interactive/step-by-step Wrangler resource setup helper (`npm run cf:setup` / `cf:setup:paid`)                                             |
