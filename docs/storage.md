# Storage Model (D1 + Repo DO + R2 + KV)

> **Full Schema & ER Diagram:** See **[`docs/dev/database-schema.md`](./dev/database-schema.md)** for complete column definitions, constraints, indexes, and Mermaid ER diagrams.

Gitra uses four complementary Cloudflare storage layers so global relational queries, per-repository strong consistency, edge caching, and large binary packfiles each use the ideal primitive.

## 1. Cloudflare D1 (`DB`)

- Global relational authority managed via Drizzle ORM (`drizzle-d1.config.ts` → `drizzle/d1/`, bootstrapped once per isolate by `src/worker/db/d1/bootstrap.ts`).
- 11 application tables: `users`, `namespaces`, `namespace_memberships`, `namespace_directory_meta`, `namespace_profile_meta`, `repositories`, `repository_meta`, `personal_access_tokens`, `pat_namespace_grants`, `pat_repo_grants`, `pat_global_grants`.

## 2. Repository Durable Object (`REPO_DO` — `RepoDurableObject`)

- Per-repository strongly consistent metadata authority (`src/worker/do/repo/repoDO.ts`).
- DO KV storage holds `refs`, `head`, exclusive `receiveLease` / `compactLease`, `compactionWantedAt`, and `lastAccessMs`.
- Embedded SQLite (`drizzle-orm/durable-sqlite`, `drizzle-repo-do.config.ts` → `drizzle/repo-do/`) stores **`pack_catalog`** (authoritative active/superseded pack metadata). All SQLite access goes through `src/worker/do/repo/db/dal/`.

## 3. Cloudflare R2 (`REPO_BUCKET`)

- Scalable data plane for Git packs and uploaded brand assets (`src/worker/keys.ts`, `src/worker/branding.ts`):
  - `do/<doId>/objects/pack/<name>.pack` — packfile payloads (served via range reads)
  - `do/<doId>/objects/pack/<name>.idx` — pack v2 indexes (authoritative OID offsets)
  - `do/<doId>/objects/pack/<name>.refs` — logical object-reference sidecars accelerating fetch closure
  - `site-assets/logo`, `site-assets/favicon`, `site-assets/og-image` — uploaded site branding images

## 4. Cloudflare KV (`ROUTES`)

- Non-sensitive public repository route candidate cache (private repos omitted)
- Branch summary cache (`src/worker/repositories/routeCache.ts`)
- Auth failure rate-limit windows (`auth-rl:<scope>:<ip>:<target>`)
- Live site branding & SEO overrides (`site:branding:v1`)
