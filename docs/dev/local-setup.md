---
title: Local Development Setup
description: Set up a local Gitra development environment with Vite, @cloudflare/vite-plugin, Drizzle ORM, and Wrangler types.
order: 3
draft: false
---

# Local Development Setup

Gitra runs locally via **Vite 8** and **`@cloudflare/vite-plugin`**, executing the actual Cloudflare Worker runtime (`workerd`) with local D1, Durable Objects, R2, and KV emulation alongside hot-reloading React SSR and Tailwind CSS v4.

---

## 1. Prerequisites

- **Node.js `20+`** (recommended `22+`)
- **npm**
- **Git `2.26+`**

---

## 2. Install & Configure Local Environment

```bash
git clone https://github.com/vibtoolshq/gitra.git
cd gitra
npm install
cp .dev.vars.example .dev.vars
```

`.dev.vars` is read by Wrangler and `@cloudflare/vite-plugin` during local development and typegen (`npm run cf-typegen`). By default, leaving `ADMIN_PASSWORD` empty and `AUTH_MODE=development` enables Demo Mode locally.

---

## 3. Start the Development Server

```bash
npm run dev
```

- Listens on **`http://localhost:3000`** (`vite.config.ts`).
- First HTTP request triggers `ensureD1Schema()` (`src/worker/db/d1/bootstrap.ts`), automatically creating all 11 D1 tables in the local Miniflare database.
- Demo Mode lazily seeds demo accounts (`admin`, `alex-dev`) and sample repositories on first access (`src/worker/auth/demoSeed.ts`).

---

## 4. Common Development Commands (`package.json`)

| Command                                         | Action                                                                                          |
| :---------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| `npm run dev`                                   | Start Vite + Cloudflare Workers dev server on port 3000                                         |
| `npm run build`                                 | Production build (client bundle + SSR Worker bundle via Vite)                                   |
| `npm run typecheck`                             | Run `npm run types:generate && tsc -p test/tsconfig.json --noEmit`                              |
| `npm run format`                                | Format codebase with Prettier                                                                   |
| `npm run format:check`                          | Verify Prettier formatting without modifying files                                              |
| `npm run cf-typegen` _(alias `types:generate`)_ | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` & `.dev.vars.example`              |
| `npm run db:generate`                           | Generate Drizzle SQL migrations for both Repo DO (`db:generate:repo`) and D1 (`db:generate:d1`) |
| `npm run db:generate:repo`                      | Generate Drizzle SQL migrations for `RepoDurableObject` (`drizzle-repo-do.config.ts`)           |
| `npm run db:generate:d1`                        | Generate Drizzle SQL migrations for Cloudflare D1 (`drizzle-d1.config.ts`)                      |
| `npm run db:migrate:local`                      | Apply D1 migrations locally via Wrangler                                                        |
| `npm run db:migrate`                            | Apply D1 migrations against remote production D1                                                |
| `npm run test`                                  | Run Node Vitest unit tests (`vitest.unit.config.ts`)                                            |
| `npm run test:workers`                          | Run Cloudflare Workers integration tests (`vitest.config.ts`)                                   |
| `npm run test:auth`                             | Run `test/auth.worker.test.ts`                                                                  |

---

## 5. Working with Database Schemas

- **D1 Schema (`src/worker/db/d1/schema/*.ts`):** Edit schema files first, then run `npm run db:generate:d1`. Also keep `src/worker/db/d1/bootstrap.ts` synchronized for zero-config local preview bootstrapping. Never hand-edit generated files in `drizzle/d1/`.
- **Repo DO SQLite Schema (`src/worker/do/repo/db/schema.ts`):** Edit `schema.ts` first, then run `npm run db:generate`. Never hand-edit generated files in `drizzle/repo-do/`. All queries must go through `src/worker/do/repo/db/dal/`.

---

## 6. Switching Between Demo Mode and Production Auth Locally

To test Production auth behavior locally before deploying:

1. Set `AUTH_MODE=production`, `ADMIN_PASSWORD=<strong-pass>`, and `SESSION_SECRET=<random-hex>` in `.dev.vars`.
2. Restart `npm run dev`.
3. Verify `/auth` hides Demo Mode quick-login buttons and `POST /auth/demo-login` returns `404`.
