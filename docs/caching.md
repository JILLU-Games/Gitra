# Caching Strategy

Gitra implements a visibility-aware, two-tier Cloudflare Workers Cache API strategy plus per-request memoization and selective KV caching (`src/worker/cache/cache.ts`, `src/worker/cache/policy.ts`).

---

## 1. Two-Tier Workers Cache API

### UI Layer Cache (`git-on-cf:json`)

Caches JSON responses for **public** web UI and `ls-refs` operations using synthetic same-origin GET keys under `/_cache/*`:

- **HEAD / refs (`/_cache/refs?repo=<doName>&v=<updatedAt>`):** 60s TTL; versioned by `repositories.updated_at` and actively purged on push / admin ref edits.
- **Tree listings & blob metadata (`/_cache/tree`):** 60s for trees, 300s for blob metadata.
- **README content (`/_cache/readme`):** 5 minutes (300s).
- **Commits (`/_cache/commits`):** 60s for branch refs, 1 hour (3600s) for immutable tag/OID refs.
- **Commit diffs & patches:** Long TTL keyed by immutable commit OID.

### Immutable Git Object Cache (`git-on-cf:objects`)

- Separate cache namespace for immutable commits, trees, and blobs (`/_cache/obj/:repoId/:oid`).
- 1-year TTL with immutable headers.

---

## 2. Private-Repository & Mutating-Path Isolation (`src/worker/cache/policy.ts`)

Whenever a route targets a **`private`** repository or a credentialed mutating path (`git-receive-pack`):

1. The route gate calls `markRequestPrivate(cacheCtx)`, adding `no-cache-read` and `no-cache-write` flags to `CacheContext.memo.flags`.
2. All shared Cache API reads and writes are completely bypassed.
3. `responseCacheControl(cacheCtx)` emits `Cache-Control: no-store` (instead of `no-cache` for public responses).
4. Private repositories are also omitted from the `ROUTES` KV public route cache.

---

## 3. Per-Request Memoization & Subrequest Limiter

`CacheContext.memo` coalesces duplicate work within a single Worker request:

- `packCatalog` / `packCatalogPromise` — single per-request load via `src/worker/git/object-store/catalog.ts#loadActivePackCatalog()`
- `idxViews` / `idxViewPromises` — parsed `.idx` fanout views
- `packedObjects` / `objects` / `refs` — decoded object & reference memoization
- `limiter` — `SubrequestLimiter` (`src/worker/git/operations/limits.ts`) capping concurrent DO/R2 calls to `6` (`MAX_SIMULTANEOUS_CONNECTIONS`)
- `subreqBudget` — soft budget of `900` (`DEFAULT_SUBREQUEST_BUDGET`) before Cloudflare's hard 1000-subrequest limit

---

## 4. KV Caching (`ROUTES`)

- Public repository route candidate records (`src/worker/repositories/routeCache.ts`)
- Repository branch summary records (invalidated via `deleteRepoBranchCacheRecord()` on push and admin ref/HEAD updates)
- Live site branding overrides (`site:branding:v1`) and auth failure rate-limit counters (`auth-rl:*`)
