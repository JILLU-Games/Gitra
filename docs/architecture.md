# Architecture Overview

> **Canonical Guide:** For the full architectural documentation with Mermaid diagrams, route invariants, caching isolation, and Free/Paid tier dispatch, see **[`docs/dev/architecture.md`](./dev/architecture.md)** and **[`docs/dev/codebase-structure.md`](./dev/codebase-structure.md)**.

Gitra implements a Git Smart HTTP v2 server and web forge on **Cloudflare Workers** (`Hono` + **React 19 SSR** + Client Islands) backed by **Cloudflare D1**, per-repository **Durable Objects (`RepoDurableObject` with SQLite)**, **R2** pack storage, **KV**, and optional **Cloudflare Queues** (Paid tier).

## Module Layout (`src/`)

- **`src/worker/`** — Cloudflare Worker runtime:
  - `index.ts` — Hono application entry point, route registration order, `queue` consumer, and `RepoDurableObject` export
  - `routes/` — Git Smart HTTP (`git.ts`), repo admin (`admin.ts`), auth/account/tokens/repos (`auth*.ts`), Site Admin Control Panel (`systemAdmin.ts`), Web UI (`ui.ts`, `ui/*`), and Zod schemas (`requestSchemas.ts`)
  - `do/repo/` — `RepoDurableObject`, receive/compaction leases, refs/HEAD authority, SQLite `pack_catalog` DAL (`db/dal/`)
  - `db/d1/` — D1 Drizzle ORM client, once-per-isolate `ensureD1Schema()` bootstrapper, 11 relational tables, and DAL modules
  - `git/` — Protocol v2 `upload-pack` & `receive-pack`, streaming pack assembly/indexing, pack-first object store, commit diffs, and browser file commits (`commitFile.ts`)
  - `auth/` — Local primary admin + PBKDF2-SHA256 directory auth, AES-256-GCM sealed `__Host-goc_session` cookies, scoped & Global Admin PAT verification, CSRF origin checks, and KV rate limiting
  - `cache/` — Two-tier Workers Cache API (`git-on-cf:json`, `git-on-cf:objects`) with private-repository bypass (`policy.ts`)
  - `tasks/` — Queue dispatcher (`dispatch.ts`) supporting Free-tier inline fallback and Paid-tier Cloudflare Queues (`queue.ts`)
  - `branding.ts` — Live KV site branding (`site:branding:v1`) and R2 brand assets (`site-assets/*`)
- **`src/client/`** — React 19 SSR (`server/registry.tsx`, `pages/*`, `components/*`), focused browser islands (`islands/*`), and Vite entrypoints (`entrypoints.ts`, `entries/*`)
- **`src/shared/`** — Isomorphic branding, slug, RBAC, and web helpers

## See Also

- [Full Architecture & Diagrams](./dev/architecture.md)
- [Storage Model](./storage.md) & [Database Schema](./dev/database-schema.md)
- [Data Flows](./data-flows.md)
- [Caching Strategy](./caching.md)
- [API Endpoints Reference](./dev/api-reference.md)
