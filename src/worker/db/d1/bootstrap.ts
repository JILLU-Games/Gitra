/**
 * Idempotent once-per-isolate D1 schema bootstrap.
 *
 * Production and CI apply D1 migrations explicitly (`npm run db:migrate` /
 * `applyD1Migrations`), while fresh Live Preview environments start with an
 * empty local Miniflare D1 database. Checking `sqlite_master` once per isolate
 * keeps normal requests fast while ensuring preview boots cleanly on the first
 * request without requiring manual migration commands.
 */

const BOOTSTRAP_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    tessera_sub text NOT NULL,
    created_at integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_tessera_sub_unique ON users (tessera_sub)`,
  `CREATE TABLE IF NOT EXISTS namespaces (
    id text PRIMARY KEY NOT NULL,
    slug text NOT NULL,
    created_by text NOT NULL,
    created_at integer NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE no action ON DELETE restrict
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS namespaces_slug_unique ON namespaces (slug)`,
  `CREATE TABLE IF NOT EXISTS namespace_memberships (
    namespace_id text NOT NULL,
    user_id text NOT NULL,
    created_at integer NOT NULL,
    PRIMARY KEY(namespace_id, user_id),
    FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS idx_namespace_memberships_user_ns ON namespace_memberships (user_id, namespace_id)`,
  `CREATE TABLE IF NOT EXISTS repositories (
    id text PRIMARY KEY NOT NULL,
    namespace_id text NOT NULL,
    created_by text NOT NULL,
    slug text NOT NULL,
    do_name text NOT NULL,
    visibility text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE no action ON DELETE restrict,
    CONSTRAINT chk_repositories_visibility CHECK(visibility IN ('public','private'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_repositories_namespace_slug ON repositories (namespace_id, slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_repositories_do_name ON repositories (do_name)`,
  `CREATE INDEX IF NOT EXISTS idx_repositories_namespace_updated ON repositories (namespace_id, updated_at desc, slug)`,
  `CREATE TABLE IF NOT EXISTS personal_access_tokens (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    hash text NOT NULL,
    created_at integer NOT NULL,
    expires_at integer,
    revoked_at integer,
    last_used_at integer,
    FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS personal_access_tokens_prefix_unique ON personal_access_tokens (prefix)`,
  `CREATE INDEX IF NOT EXISTS idx_pats_user_created ON personal_access_tokens (user_id, created_at desc)`,
  `CREATE TABLE IF NOT EXISTS pat_namespace_grants (
    pat_id text NOT NULL,
    namespace_id text NOT NULL,
    level text NOT NULL,
    PRIMARY KEY(pat_id, namespace_id),
    FOREIGN KEY (pat_id) REFERENCES personal_access_tokens(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON UPDATE no action ON DELETE cascade,
    CONSTRAINT chk_pat_namespace_grants_level CHECK(level IN ('pull','push'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pat_namespace_grants_namespace ON pat_namespace_grants (namespace_id)`,
  `CREATE TABLE IF NOT EXISTS pat_repo_grants (
    pat_id text NOT NULL,
    repo_id text NOT NULL,
    level text NOT NULL,
    PRIMARY KEY(pat_id, repo_id),
    FOREIGN KEY (pat_id) REFERENCES personal_access_tokens(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON UPDATE no action ON DELETE cascade,
    CONSTRAINT chk_pat_repo_grants_level CHECK(level IN ('pull','push'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pat_repo_grants_repo ON pat_repo_grants (repo_id)`,
  // Auxiliary directory metadata for Admin Panel user/namespace roles and
  // active/disabled status. Created with IF NOT EXISTS so existing D1
  // migrations remain untouched.
  `CREATE TABLE IF NOT EXISTS namespace_directory_meta (
    namespace_id text PRIMARY KEY NOT NULL,
    display_name text NOT NULL DEFAULT '',
    role text NOT NULL DEFAULT 'member',
    status text NOT NULL DEFAULT 'active',
    password_hash text,
    last_active_at integer,
    updated_at integer NOT NULL,
    FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON UPDATE no action ON DELETE cascade,
    CONSTRAINT chk_namespace_directory_role CHECK(role IN ('admin','member','viewer')),
    CONSTRAINT chk_namespace_directory_status CHECK(status IN ('active','disabled'))
  )`,
  // Record the baseline Drizzle migration in Wrangler's `d1_migrations` table
  // so subsequent `wrangler d1 migrations apply` or Vitest `applyD1Migrations`
  // calls treat the bootstrapped schema as already applied instead of failing
  // on `CREATE TABLE users`.
  `CREATE TABLE IF NOT EXISTS "d1_migrations" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `INSERT OR IGNORE INTO "d1_migrations" (name) VALUES ('0000_gray_supernaut.sql')`,
];

const ensuredDatabases = new WeakMap<D1Database, Promise<void>>();

async function runSchemaCheck(db: D1Database): Promise<void> {
  const existing = await db
    .prepare(`SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1`)
    .first<{ present: number }>();
  if (existing) return;
  await db.batch(BOOTSTRAP_STATEMENTS.map((sql) => db.prepare(sql)));
}

export async function ensureD1Schema(db: D1Database): Promise<void> {
  const existingPromise = ensuredDatabases.get(db);
  if (existingPromise) {
    return existingPromise;
  }
  const initPromise = runSchemaCheck(db).catch((error) => {
    // Allow subsequent requests to retry if a transient D1 error occurred.
    ensuredDatabases.delete(db);
    throw error;
  });
  ensuredDatabases.set(db, initPromise);
  return initPromise;
}
