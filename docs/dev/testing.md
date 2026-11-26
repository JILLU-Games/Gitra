---
title: Testing Guide
description: How to run Gitra's Node unit tests, node:test deploy/tier suites, Cloudflare Workers integration tests, and opt-in pack fixtures.
order: 8
draft: false
---

# Testing Guide

Gitra has 96 test files under `test/` spanning three test runners/layers: fast pure-logic Node tests, Node built-in `node:test` suites for tier/deploy helpers, and full Cloudflare Workers (`workerd` / Miniflare) integration tests.

---

## 1. Test Suites Overview

| Suite                                      | Command                                                                                                    | Config / Runner                                                                                                     | Scope                                                                                                                              |
| :----------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------- |
| **Node Unit Tests**                        | `npm run test`                                                                                             | `vitest.unit.config.ts` (`test/**/*.test.ts`, excluding `*.worker.test.ts`)                                         | Pure Git object/pkt-line/pack parsing, branding sanitization, RBAC/slug helpers, origin checks, rate-limit math                    |
| **Cloudflare Workers Integration Tests**   | `npm run test:workers`                                                                                     | `vitest.config.ts` (`@cloudflare/vitest-pool-workers`, `test/**/*.worker.test.ts`, excluding `auth.worker.test.ts`) | End-to-end Smart HTTP v2 push/fetch, DO leases, compaction, caching, UI routes, D1 DAL, queue handlers                             |
| **Authentication Worker Suite**            | `npm run test:auth`                                                                                        | `vitest.config.ts` (`test/auth.worker.test.ts`)                                                                     | Login, Demo vs Production mode, cookies, PAT scopes, Global Admin PATs, CSRF, RBAC, Admin APIs                                     |
| **Tier & Auto-Deploy Unit Tests**          | `node --test test/cloudflare-tier.node-test.ts test/cf-auto-deploy.node-test.ts`                           | Node native `node:test`                                                                                             | Free/Paid tier resolution (`src/worker/common/tier.ts`) and zero-touch auto-deploy helper logic (`scripts/cf-auto-deploy-lib.mjs`) |
| **42 MiB Pack Indexer Fixture** _(opt-in)_ | `PACK_INDEXER_FIXTURE=1 npx vitest run --config vitest.config.ts test/pack-indexer-fixture.worker.test.ts` | `vitest.config.ts` + `FIXTURE_READER` service binding                                                               | Large-pack streaming indexer stress test                                                                                           |

---

## 2. Running Targeted Tests

```bash
# Single Node unit test
npx vitest run --config vitest.unit.config.ts test/object-parse.test.ts

# Single Cloudflare Worker integration test
npx vitest run --config vitest.config.ts test/streaming-receive.worker.test.ts

# Auth integration suite
npm run test:auth
```

---

## 3. Worker Test Runtime Details (`vitest.config.ts`)

- Points directly at `./src/worker/index.ts` and `./wrangler.jsonc`.
- Compatibility date (`2026-05-13`) and compatibility flags (`["nodejs_als"]`) stay aligned with `wrangler.jsonc`.
- Uses `singleWorker: true`, `isolatedStorage: false`, and in-memory persistence (`durableObjectsPersist: false`, `kvPersist: false`, `r2Persist: false`, `cachePersist: false`) to prevent filesystem SQLite lock (`EBUSY` / `CANTOPEN`) issues across platforms.
- Stable test environment variables are defined in `test/vitest.bindings.ts`.
- Exposes a Node-backed `FIXTURE_READER` service binding so `workerd` tests can stream large binary fixtures from disk without bundling them into the Worker isolate.

---

## 4. Recommended Validation Matrix Before PRs

| Area Modified                                           | Minimum Validation Commands                                                                            |
| :------------------------------------------------------ | :----------------------------------------------------------------------------------------------------- |
| Pure parsing, shared helpers, branding, or RBAC         | Targeted Vitest unit test + `npm run typecheck`                                                        |
| Git protocol, DO, pack, compaction, caching, or routing | `npm run typecheck` + affected `test/*.worker.test.ts`                                                 |
| Auth, sessions, PATs, or Site Admin                     | `npm run test:auth` + `npm run typecheck`                                                              |
| Free/Paid tier or auto-deploy scripts                   | `node --test test/cloudflare-tier.node-test.ts test/cf-auto-deploy.node-test.ts` + `npm run typecheck` |
| D1 or Repo DO SQLite schema / DAL                       | `npm run db:generate:d1` or `npm run db:generate` + `npm run typecheck` + affected worker tests        |
| SSR pages or UI components                              | `npm run typecheck` + `npm run build`                                                                  |
| Formatting check                                        | `npm run format:check`                                                                                 |
