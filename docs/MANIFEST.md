---
title: Documentation Manifest & Forensic Audit Report
description: Complete inventory of Gitra's documentation suite, feature maturity matrix, reconciled documentation mismatches, and verification report.
---

# Documentation Manifest & Forensic Audit Report

This manifest inventories every document under `docs/`, maps audited implementation modules to their corresponding guides, classifies feature maturity strictly from source verification, and records every legacy documentation mismatch corrected during the forensic audit.

---

## 1. Documentation Suite Inventory

### Root & Canonical Summaries

| File                                                  | Audience       | Purpose                                                                                  | Status     |
| :---------------------------------------------------- | :------------- | :--------------------------------------------------------------------------------------- | :--------- |
| [`docs/index.md`](./index.md)                         | All            | Master documentation portal, audience pathways, and system Mermaid diagram               | Created    |
| [`docs/MANIFEST.md`](./MANIFEST.md)                   | All / Auditors | Inventory, feature maturity matrix, mismatch reconciliation log, and QA status           | Created    |
| [`docs/CLOUDFLARE_DEPLOY.md`](./CLOUDFLARE_DEPLOY.md) | Operators      | Cloudflare Free/Paid deployment quickstart                                               | Verified   |
| [`docs/architecture.md`](./architecture.md)           | Developers     | Top-level architecture summary linking to [`dev/architecture.md`](./dev/architecture.md) | Reconciled |
| [`docs/api-endpoints.md`](./api-endpoints.md)         | Developers     | Top-level endpoint summary linking to [`dev/api-reference.md`](./dev/api-reference.md)   | Reconciled |
| [`docs/storage.md`](./storage.md)                     | Developers     | Storage layer summary (D1 + Repo DO + R2 + KV)                                           | Reconciled |
| [`docs/data-flows.md`](./data-flows.md)               | Developers     | Runtime push, fetch, web commit, diff, and purge flows                                   | Reconciled |
| [`docs/caching.md`](./caching.md)                     | Developers     | Visibility-aware two-tier Cache API + KV caching policy                                  | Reconciled |

### User Documentation (`docs/users/`)

| File                                                                                                              | Purpose                                                                                 |
| :---------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| [`docs/users/index.md`](./users/index.md)                                                                         | User & operator guide hub                                                               |
| [`docs/users/getting-started.md`](./users/getting-started.md)                                                     | Local Demo Mode startup, sign-in, PAT creation, first clone & push                      |
| [`docs/users/installation.md`](./users/installation.md)                                                           | Zero-touch Cloudflare Free/Paid auto-deploy (`cf:auto-deploy`) & GitHub Actions         |
| [`docs/users/configuration.md`](./users/configuration.md)                                                         | `.dev.vars`, Production auth mode, admin namespace decoupling, `/admin/settings`        |
| [`docs/users/workflows.md`](./users/workflows.md)                                                                 | End-to-end solo dev, team RBAC, `.vibtools` profile, Global PAT, and redeploy workflows |
| [`docs/users/troubleshooting.md`](./users/troubleshooting.md)                                                     | Verified HTTP/Git error codes and recovery playbooks                                    |
| [`docs/users/faq.md`](./users/faq.md)                                                                             | Answers on Free/Paid plans, SSH/LFS, legacy identifiers, and redeploys                  |
| [`docs/users/features/index.md`](./users/features/index.md)                                                       | Feature directory & source mapping                                                      |
| [`docs/users/features/git-protocol-and-cli.md`](./users/features/git-protocol-and-cli.md)                         | Smart HTTP v2 capabilities, Basic PAT auth, and receive lease behavior                  |
| [`docs/users/features/repositories-and-code-browser.md`](./users/features/repositories-and-code-browser.md)       | SSR code browser, commit diffs, raw/rawpath, and 256 KiB web file editor                |
| [`docs/users/features/namespaces-and-profiles.md`](./users/features/namespaces-and-profiles.md)                   | Namespaces, `/profile/admin`, `.vibtools/profile/README.md`, pinning                    |
| [`docs/users/features/auth-rbac-and-tokens.md`](./users/features/auth-rbac-and-tokens.md)                         | Demo vs Production mode, `admin`/`member`/`viewer` RBAC, repo/namespace/global PATs     |
| [`docs/users/features/admin-console-and-branding.md`](./users/features/admin-console-and-branding.md)             | `/admin/*` Control Panel, Branding Studio, R2 assets, `/:owner/:repo/admin`             |
| [`docs/users/features/cloudflare-tiers-and-auto-deploy.md`](./users/features/cloudflare-tiers-and-auto-deploy.md) | Free vs Paid tier policy and `cf-auto-deploy` guarantees                                |

### Developer Documentation (`docs/dev/`)

| File                                                            | Purpose                                                                                              |
| :-------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| [`docs/dev/index.md`](./dev/index.md)                           | Developer guide hub                                                                                  |
| [`docs/dev/architecture.md`](./dev/architecture.md)             | Full architecture, single-hop invariants, and Mermaid topology/sequence diagrams                     |
| [`docs/dev/codebase-structure.md`](./dev/codebase-structure.md) | Verified module map across `src/`, `scripts/`, `drizzle/`, and `test/`                               |
| [`docs/dev/local-setup.md`](./dev/local-setup.md)               | Local Vite + Cloudflare plugin setup, Drizzle migrations, and scripts                                |
| [`docs/dev/api-reference.md`](./dev/api-reference.md)           | Exhaustive verified HTTP route, auth, CSRF, and Zod schema reference                                 |
| [`docs/dev/database-schema.md`](./dev/database-schema.md)       | 11 D1 tables, Repo DO `pack_catalog`, R2/KV keys, and Mermaid ER diagram                             |
| [`docs/dev/security.md`](./dev/security.md)                     | Web Crypto primitives, CHIPS cookies, CSRF, rate limiting, live PAT re-checks, XSS/rawpath hardening |
| [`docs/dev/building-packaging.md`](./dev/building-packaging.md) | Vite SSR/client bundles, Free/Paid manifests, ephemeral deploy config                                |
| [`docs/dev/testing.md`](./dev/testing.md)                       | Node Vitest, `node:test`, Cloudflare Workers pool, and 42 MiB pack fixture                           |
| [`docs/dev/contributing.md`](./dev/contributing.md)             | Engineering invariants and pre-PR validation matrix                                                  |

### Reference Documentation (`docs/dev/reference/`)

| File                                                                                          | Purpose                                                                       |
| :-------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| [`docs/dev/reference/index.md`](./dev/reference/index.md)                                     | Technical reference hub                                                       |
| [`docs/dev/reference/configuration-reference.md`](./dev/reference/configuration-reference.md) | Exhaustive table of env vars, secrets, branding vars, bindings, and CLI flags |
| [`docs/dev/reference/dependencies.md`](./dev/reference/dependencies.md)                       | Audited `package.json` runtime & dev dependencies                             |
| [`docs/dev/reference/glossary.md`](./dev/reference/glossary.md)                               | Domain, Git protocol, and Cloudflare storage terminology                      |

### Vib Docs Engine Configuration (`.vibtools/`)

- `.vibtools/docs.config.json` — Dual-portal Vib Docs Engine config (`docsType: "both"`) targeting `docs.vib.tools` (`docs/users`) and `developer.vibtools.io` (`docs/dev`)
- `.vibtools/logo.svg` — Static, self-contained SVG emblem for portal headers and sidebar cards

### Historical Design & Plan Documents (Preserved with Status Headers)

- [`docs/diff.md`](./diff.md) — Commit diff proposal (V1 & V2 now implemented)
- [`docs/tessera-ownership-migration-plan.md`](./tessera-ownership-migration-plan.md) — Historical migration plan (Tessera OIDC superseded by local/D1 PBKDF2 auth)
- [`docs/better-fetch.md`](./better-fetch.md) — Historical fetch modernization design note
- [`docs/sidecar-backed-fetch-closure-proposal.md`](./sidecar-backed-fetch-closure-proposal.md) — Historical `.refs` sidecar proposal (now implemented)
- [`docs/streaming-push.md`](./streaming-push.md), [`docs/streaming-push-closure-plan.md`](./streaming-push-closure-plan.md), [`docs/streaming-push-cutover-plan.md`](./streaming-push-cutover-plan.md) — Historical streaming-push closure records

---

## 2. Feature Maturity Matrix (Forensically Verified)

|  #  | Feature Area                                                                        | Classification                     | Primary Evidence                                                                                                                                                      |
| :-: | :---------------------------------------------------------------------------------- | :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1  | Git Smart HTTP v2 (`ls-refs`, streaming `fetch`, gzip decode)                       | **Fully Implemented**              | `src/worker/routes/git.ts`, `src/worker/git/core/protocol.ts`, `src/worker/git/operations/uploadStream.ts`                                                            |
|  2  | Streaming Git Push (`git-receive-pack`) with DO Receive Lease                       | **Fully Implemented**              | `src/worker/git/receive/streamReceivePack.ts`, `src/worker/do/repo/repoDO.ts`                                                                                         |
|  3  | Pack-First Object Store + `.refs` Sidecars + Pack Compaction                        | **Fully Implemented**              | `src/worker/git/object-store/`, `src/worker/do/repo/catalog.ts`, `src/worker/tasks/compaction.ts`, `src/worker/tasks/refBackfill.ts`                                  |
|  4  | React 19 SSR Code Browser (Overview, Tree, Blob, Commits, Merge Expansion)          | **Fully Implemented**              | `src/worker/routes/ui/*`, `src/client/pages/*`, `src/client/server/registry.tsx`                                                                                      |
|  5  | Commit Detail & Lazy Per-File Diff Expansion                                        | **Fully Implemented**              | `src/worker/routes/ui/commits.ts`, `src/client/pages/CommitPage.tsx`                                                                                                  |
|  6  | Safe Raw Streaming (`/raw`) & Hotlink-Protected `/rawpath`                          | **Fully Implemented**              | `src/worker/routes/ui/raw.ts`                                                                                                                                         |
|  7  | In-Browser File Editor & `.vibtools` Profile README Commits (≤ 256 KiB)             | **Fully Implemented**              | `src/worker/routes/authRepositories.ts`, `src/worker/git/commitFile.ts`                                                                                               |
|  8  | Namespaces Directory, `/profile/admin`, Profile Metadata & Pinning                  | **Fully Implemented**              | `src/worker/index.ts`, `src/shared/slugs.ts`, `src/worker/routes/authLogin.ts`                                                                                        |
|  9  | Two-Mode Auth (Local Demo Mode vs Fail-Closed Production Mode)                      | **Fully Implemented**              | `src/worker/auth/adminAuth.ts`, `src/worker/auth/demoSeed.ts`                                                                                                         |
| 10  | Sealed AES-256-GCM `__Host-goc_session` Cookies & PBKDF2-SHA256 Passwords           | **Fully Implemented**              | `src/worker/auth/session.ts`, `src/worker/auth/cookies.ts`, `src/worker/auth/passwords.ts`                                                                            |
| 11  | Three-Tier RBAC (`admin`, `member`, `viewer`) + Active/Disabled Status              | **Fully Implemented**              | `src/shared/admin/panel.ts`, `src/worker/routes/systemAdmin.ts`                                                                                                       |
| 12  | Scoped (`repo`, `namespace`) & Global Admin PATs with Live Role Re-Check            | **Fully Implemented**              | `src/worker/auth/pat.ts`, `src/worker/routes/authTokens.ts`                                                                                                           |
| 13  | Site Administration Control Panel (`/admin/*`) & User Directory                     | **Fully Implemented**              | `src/worker/routes/systemAdmin.ts`, `src/client/pages/SystemAdminPage.tsx`, `AdminUsersPage.tsx`, `AdminSecurityPage.tsx`                                             |
| 14  | Live Branding, SEO, `robots.txt`, & R2 Brand Asset Studio (`/admin/settings`)       | **Fully Implemented**              | `src/worker/branding.ts`, `src/shared/branding.ts`, `src/client/pages/AdminSettingsPage.tsx`                                                                          |
| 15  | Per-Repository Admin Dashboard (`refs`, `HEAD`, compact, debug, pack delete, purge) | **Fully Implemented**              | `src/worker/routes/admin.ts`, `src/client/pages/AdminPage.tsx`                                                                                                        |
| 16  | Visibility-Aware Two-Tier Caching & Private-Repo Isolation                          | **Fully Implemented**              | `src/worker/cache/cache.ts`, `src/worker/cache/policy.ts`                                                                                                             |
| 17  | CSRF Same-Origin Guard & KV Auth Rate Limiting (8 fails / 300s)                     | **Fully Implemented**              | `src/worker/auth/origin.ts`, `src/worker/auth/rateLimit.ts`                                                                                                           |
| 18  | Cloudflare Free & Paid Tier Dispatch + Zero-Touch Auto-Deploy + GitHub Actions      | **Fully Implemented**              | `src/worker/common/tier.ts`, `src/worker/tasks/dispatch.ts`, `scripts/cf-auto-deploy*.mjs`, `.github/workflows/deploy-cloudflare.yml`                                 |
| 19  | Legacy Brand Identifiers in Internal Metadata / Error Titles                        | **Observed Legacy Detail**         | `package.json#name` (`git-on-cloudflare`), `src/client/server/registry.tsx` default titles, `src/worker/index.ts:330`, `agent=git-on-cloudflare/0.1`, `goc_` prefixes |
| 20  | `openid-client` Package & `users.tessera_sub` Column Name                           | **Deprecated / Unused Dependency** | `package.json` (`openid-client: ^6.8.4` has 0 imports); `src/worker/db/d1/schema/users.ts` (`tessera_sub` holds `local:<username>`)                                   |
| 21  | Loose Object Key Helper (`r2LooseKey`)                                              | **Legacy Helper Only**             | `src/worker/keys.ts#r2LooseKey` — active writes are strictly pack-only                                                                                                |
| 22  | Pull Requests, Issues, Webhooks, SSH Transport, Git LFS, SHA-256 Repos              | **Not Implemented**                | Explicitly confirmed absent from routes, schemas, and protocol handlers                                                                                               |

---

## 3. Reconciled Mismatches in Pre-Existing `docs/`

1. **Router Engine (`docs/architecture.md`):** Previously claimed `AutoRouter` (`itty-router`); corrected to **Hono** (`src/worker/index.ts`, `src/worker/routes/hono.ts`).
2. **Stale Source Paths (`docs/architecture.md`, `storage.md`, `data-flows.md`, `caching.md`, `diff.md`):** Updated outdated `src/index.ts`, `src/do/`, `src/git/`, `src/ui/`, `src/routes/`, `src/keys.ts`, and `drizzle.config.ts` references to verified `src/worker/`, `src/client/`, `src/shared/`, `drizzle-d1.config.ts`, and `drizzle-repo-do.config.ts`.
3. **Authentication Model (`docs/architecture.md`, `api-endpoints.md`, `tessera-ownership-migration-plan.md`):** Replaced stale Tessera OIDC claims with verified local admin + D1 PBKDF2 directory auth, Demo vs Production modes, RBAC, and Global Admin PATs.
4. **Missing Endpoint Coverage (`docs/api-endpoints.md`):** Added complete coverage for `/explore`, `/namespaces`, `/profile/:owner`, `/user/*`, `/auth/login`, `/auth/demo-login`, `/auth/sign-out`, `/auth/api/change-password`, `/auth/api/profile`, web file/profile-README commits, `/commit/:oid/diff`, `/admin/*`, `/admin/api/*`, `/api/site-assets/:slot`, `/favicon.ico`, and `/robots.txt`.
5. **Storage & Caching Gaps (`docs/storage.md`, `docs/caching.md`):** Added all 11 D1 tables, `.refs` sidecars, R2 `site-assets/*`, KV `site:branding:v1` / `auth-rl:*`, and `markRequestPrivate()` cache-bypass policy.
6. **Commit Diff Status (`docs/diff.md`):** Added banner clarifying that V1 changed-file list and V2 lazy patch endpoint are implemented.
