---
title: Dependencies Reference
description: Audited inventory of all runtime and development dependencies in Gitra's package.json, including unused legacy dependency findings.
order: 2
draft: false
---

# Dependencies Reference

All packages and version specifiers below are verified directly against `package.json` (`name: "git-on-cloudflare"`, `version: "0.1.0"`, `type: "module"`).

---

## 1. Runtime Dependencies (`dependencies`)

| Package             | Version    | Role in Gitra                                                                                                                       | Audit Status                                                                                                   |
| :------------------ | :--------- | :---------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **`hono`**          | `^4.12.18` | Edge HTTP router, cookie helpers (`hono/cookie`), middleware, and typed `AppContext` (`src/worker/routes/hono.ts`)                  | Active                                                                                                         |
| **`react`**         | `^19.2.6`  | UI component library for SSR pages and client islands (`src/client/`)                                                               | Active                                                                                                         |
| **`react-dom`**     | `^19.2.6`  | `react-dom/server` (`renderToReadableStream`) on Worker + `react-dom/client` island hydration                                       | Active                                                                                                         |
| **`drizzle-orm`**   | `^0.45.1`  | Type-safe SQLite ORM (`drizzle-orm/d1` for Cloudflare D1, `drizzle-orm/durable-sqlite` for `RepoDurableObject`)                     | Active                                                                                                         |
| **`zod`**           | `^4.4.3`   | Request body validation (`src/worker/routes/requestSchemas.ts`), session payload validation, and queue message schemas              | Active                                                                                                         |
| **`pako`**          | `^2.1.0`   | Zlib inflate/deflate for Git objects and packfile compression/decompression (`src/worker/common/compression.ts`, `src/worker/git/`) | Active                                                                                                         |
| **`marked`**        | `^18.0.3`  | Markdown parsing for repository READMEs and `.vibtools/profile/README.md`                                                           | Active                                                                                                         |
| **`htmlparser2`**   | `^12.0.0`  | HTML parsing used during safe Markdown/HTML rendering and sanitization                                                              | Active                                                                                                         |
| **`domhandler`**    | `^6.0.1`   | DOM node handler paired with `htmlparser2` for HTML sanitization                                                                    | Active                                                                                                         |
| **`highlight.js`**  | `^11.11.1` | Server/client syntax highlighting in the file blob viewer (`BlobPage.tsx`)                                                          | Active                                                                                                         |
| **`lucide-react`**  | `^1.7.0`   | UI icon set across SSR pages, navigation, footer, and admin control panel                                                           | Active                                                                                                         |
| **`openid-client`** | `^6.8.4`   | Legacy Tessera OIDC client library                                                                                                  | **Unused / Legacy** — zero imports across `src/`, `scripts/`, and `test/`; retained from prior OIDC auth model |

---

## 2. Development & Build Dependencies (`devDependencies`)

| Package                                                                          | Version                                    | Role in Gitra                                                                                   |
| :------------------------------------------------------------------------------- | :----------------------------------------- | :---------------------------------------------------------------------------------------------- |
| **`vite`**                                                                       | `^8.0.12`                                  | Frontend & SSR bundler + local dev server (`npm run dev`, `npm run build`)                      |
| **`@cloudflare/vite-plugin`**                                                    | `^1.36.4`                                  | Runs Cloudflare Workers runtime (`workerd`) seamlessly inside Vite dev/build                    |
| **`@vitejs/plugin-react`**                                                       | `^6.0.0`                                   | React JSX transform & Fast Refresh integration for Vite                                         |
| **`tailwindcss`**                                                                | `^4.3.0`                                   | Tailwind CSS v4 design system (`src/client/styles/app.css`)                                     |
| **`@tailwindcss/vite`**                                                          | `^4.3.0`                                   | First-party Vite plugin for Tailwind CSS v4                                                     |
| **`wrangler`**                                                                   | `^4.90.1`                                  | Cloudflare CLI for D1 migrations, `wrangler types`, secrets, and deployment                     |
| **`drizzle-kit`**                                                                | `^0.31.4`                                  | SQL migration generator for `drizzle-d1.config.ts` and `drizzle-repo-do.config.ts`              |
| **`typescript`**                                                                 | `^6.0.0`                                   | Strict TypeScript compiler (`npm run typecheck`)                                                |
| **`vitest`**                                                                     | `^4.1.6`                                   | Unit and integration test runner (`vitest.unit.config.ts`, `vitest.config.ts`)                  |
| **`@cloudflare/vitest-pool-workers`**                                            | `^0.16.4`                                  | Runs Worker integration tests inside real Miniflare / `workerd` isolates                        |
| **`tsx`**                                                                        | `^4.7.0`                                   | TypeScript execution helper for Node scripts/tooling                                            |
| **`prettier`**                                                                   | `^3.6.2`                                   | Code formatter (`npm run format`, `npm run format:check`); note no ESLint package is configured |
| **`@types/node`**, **`@types/pako`**, **`@types/react`**, **`@types/react-dom`** | `^25.7.0`, `^2.0.4`, `^19.2.14`, `^19.2.3` | TypeScript type definitions                                                                     |

---

## 3. Platform Runtime APIs (Zero-Dependency Built-Ins)

Gitra intentionally relies on standard Cloudflare Workers / Web APIs rather than Node polyfills wherever possible:

- **Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`)**: PBKDF2-SHA256, HKDF-SHA256, AES-256-GCM, SHA-256, `timingSafeEqual`, and `crypto.DigestStream` (Cloudflare Workers incremental SHA-1 streaming for packfiles).
- **Web Streams API (`ReadableStream`, `TransformStream`)**: Streaming pack upload/download and React 19 `renderToReadableStream()`.
- **Cloudflare Workers Runtime Bindings**: `D1Database`, `KVNamespace`, `R2Bucket`, `DurableObjectNamespace`, `Queue`, `Fetcher` (`ASSETS`), and `caches.open()`.
