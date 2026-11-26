---
title: Contributing to Gitra
description: Engineering invariants, coding conventions, and contribution checklist for Gitra developers.
order: 9
draft: false
---

# Contributing to Gitra

Thank you for contributing to **Gitra** (`https://gitra.co/`), maintained by **[Vib Tools](https://vib.tools/)** (`@vibtoolshq`). For community standards and PR etiquette, also review the repository root [CONTRIBUTING.md](https://github.com/vibtoolshq/gitra/blob/main/CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](https://github.com/vibtoolshq/gitra/blob/main/CODE_OF_CONDUCT.md).

---

## Core Engineering Invariants

Every pull request must uphold these verified architectural rules:

1. **Single-Hop Cross-Runtime Boundaries:** Keep calls to a single hop (`Worker → DO`, `Worker → R2`, or `DO → R2` during DO alarm cleanup). Do not introduce transitive `Worker → DO → R2` chains or distributed Worker-side transactions.
2. **Durable Object Error Handling:** `RepoDurableObject` RPC methods communicate expected conflicts and states via **tagged unions** (e.g. `{ ok: true, ... } | { ok: false, reason: ... }`). Reserve `throw` for unrecoverable failures, and never call `blockConcurrencyWhile` inside runtime RPCs.
3. **Limiter Discipline (`src/worker/git/operations/limits.ts`):** Every request-scoped R2 read/write and outbound DO RPC must run through `limiter.run(label, fn)` (using descriptive target-prefixed labels like `"r2:get-pack"` or `"do:admin-list-refs"`) and respect the 6-connection / 900-subrequest budget.
4. **DAL-Only SQLite Access:** All Repo DO SQLite queries must live in `src/worker/do/repo/db/dal/`, and all D1 queries must live in `src/worker/db/d1/dal/*`. Never scatter raw Drizzle queries across route handlers.
5. **Preserve Route Ordering (`src/worker/index.ts`):** System routes (`registerGitRoutes`, `registerAdminRoutes`, `registerAuthRoutes`, `registerSystemAdminRoutes`, `/`, `/explore`, `/namespaces`) must remain registered **before** `registerUiRoutes` so `/:owner` never shadows `/auth`, `/admin`, `/user`, `/explore`, or `/namespaces`.
6. **Zero Hardcoded Secrets or Prod IDs:** Never commit production D1 UUIDs, KV IDs, R2 bucket names, custom domains, or secrets into `wrangler.jsonc`, `wrangler.paid.jsonc`, or source files.
7. **Reuse Canonical Types & Helpers:** Check existing hubs before introducing helpers or types:
   - `src/worker/git/core/objects.ts` (`GitObjectType`)
   - `src/worker/common/hex.ts` (OID helpers, `zeroOid`)
   - `src/worker/git/object-store/support.ts` (`typeCodeToObjectType`)
   - `src/worker/git/operations/limits.ts` (`Limiter`)
   - `src/shared/slugs.ts`, `src/shared/admin/panel.ts`, `src/shared/branding.ts`
8. **Structured Visibility Logging:** Non-trivial R2, DO RPC, auth, and background paths must emit structured logs via `createLogger` (`src/worker/common/logger.ts`), `c.var.logFor(...)`, or `this.logger` with scoped kebab-case event names (e.g. `"receive:finalize-committed"`).
9. **UI Registration:** Register new SSR views in `src/client/server/registry.tsx` and wire client hydration (only when needed) via `src/client/entrypoints.ts` and `src/client/islands/`.
10. **Clean Comments & No Milestone Markers:** Keep comments synchronized with behavior and omit phase/WIP labels (`Phase 1/2/3`, `TODO: next phase`) once code lands.

---

## Formatting & Pre-Submission Checklist

- Run `npm run format:check` (Prettier is the project formatter; there is no ESLint config in the repository).
- Run `npm run typecheck` and `npm run build`.
- Run the tests covering your subsystem (see [Testing Guide](./testing.md)).
- Update relevant documentation under `docs/` when routes, schemas, env vars, or workflows change.
