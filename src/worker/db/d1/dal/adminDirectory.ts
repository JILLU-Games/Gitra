import { eq } from "drizzle-orm";

import {
  sanitizeDisplayName,
  type DirectoryRole,
  type DirectoryStatus,
} from "@/shared/admin/panel";
import type { Db } from "@/worker/db/d1/client";
import { namespaceMemberships } from "@/worker/db/d1/schema/namespaceMemberships";
import { namespaces } from "@/worker/db/d1/schema/namespaces";
import { repositories } from "@/worker/db/d1/schema/repositories";
import { users } from "@/worker/db/d1/schema/users";

export type NamespaceDirectoryMetaRow = {
  namespace_id: string;
  display_name: string;
  role: DirectoryRole;
  status: DirectoryStatus;
  password_hash: string | null;
  last_active_at: number | null;
  updated_at: number;
};

export type NamespaceDirectoryListing = {
  id: string;
  slug: string;
  displayName: string;
  createdBy: string;
  createdAt: number;
  lastActiveAt: number;
  role: DirectoryRole;
  status: DirectoryStatus;
  repoCount: number;
  hasPassword: boolean;
};

export type DirectoryAuthAccount = {
  userId: string;
  namespaceId: string;
  slug: string;
  displayName: string;
  role: DirectoryRole;
  status: DirectoryStatus;
  passwordHash: string | null;
  hasPassword: boolean;
};

const CREATE_META_TABLE_SQL = `CREATE TABLE IF NOT EXISTS namespace_directory_meta (
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
)`;

const ensuredMetaDatabases = new WeakMap<D1Database, Promise<void>>();

/**
 * Ensures the auxiliary `namespace_directory_meta` table exists and is upgraded
 * to include `display_name`, `viewer` role, `password_hash`, and `last_active_at`.
 * Handles both fresh databases and existing local dev D1 tables idempotently.
 */
export async function ensureNamespaceDirectoryMetaTable(d1: D1Database): Promise<void> {
  const existing = ensuredMetaDatabases.get(d1);
  if (existing) return existing;

  const promise = (async () => {
    const tableInfo = await d1
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'namespace_directory_meta' LIMIT 1`
      )
      .first<{ sql: string | null }>();

    if (!tableInfo?.sql) {
      await d1.prepare(CREATE_META_TABLE_SQL).run();
      return;
    }

    const ddl = tableInfo.sql;
    const hasViewerRole = ddl.includes("'viewer'");
    const hasDisplayName = ddl.includes("display_name");
    const hasLastActive = ddl.includes("last_active_at");
    const hasPasswordHash = ddl.includes("password_hash");

    if (hasViewerRole && hasDisplayName && hasLastActive && hasPasswordHash) {
      return;
    }

    // Fast-path when only password_hash is missing on an already upgraded table.
    if (hasViewerRole && hasDisplayName && hasLastActive && !hasPasswordHash) {
      await d1
        .prepare(`ALTER TABLE namespace_directory_meta ADD COLUMN password_hash text`)
        .run();
      return;
    }

    // Upgrade legacy table in a single atomic batch.
    const displayNameSelect = hasDisplayName ? "display_name" : "''";
    const lastActiveSelect = hasLastActive ? "last_active_at" : "updated_at";
    const passwordHashSelect = hasPasswordHash ? "password_hash" : "NULL";
    await d1.batch([
      d1.prepare(`DROP TABLE IF EXISTS namespace_directory_meta_v2`),
      d1.prepare(`CREATE TABLE namespace_directory_meta_v2 (
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
      )`),
      d1.prepare(
        `INSERT INTO namespace_directory_meta_v2 (namespace_id, display_name, role, status, password_hash, last_active_at, updated_at)
         SELECT namespace_id, ${displayNameSelect}, role, status, ${passwordHashSelect}, ${lastActiveSelect}, updated_at
         FROM namespace_directory_meta`
      ),
      d1.prepare(`DROP TABLE namespace_directory_meta`),
      d1.prepare(`ALTER TABLE namespace_directory_meta_v2 RENAME TO namespace_directory_meta`),
    ]);
  })().catch((error) => {
    ensuredMetaDatabases.delete(d1);
    throw error;
  });

  ensuredMetaDatabases.set(d1, promise);
  return promise;
}

export async function listAllNamespaceDirectoryEntries(
  d1: D1Database,
  db: Db,
  primaryAdminNamespaceId: string | null
): Promise<NamespaceDirectoryListing[]> {
  await ensureNamespaceDirectoryMetaTable(d1);

  const [allNamespaces, allRepos, metaResult] = await Promise.all([
    db.select().from(namespaces),
    db.select({ namespaceId: repositories.namespaceId }).from(repositories),
    d1
      .prepare(
        `SELECT namespace_id, display_name, role, status, password_hash, last_active_at, updated_at
         FROM namespace_directory_meta`
      )
      .all<NamespaceDirectoryMetaRow>(),
  ]);

  const repoCounts = new Map<string, number>();
  for (const repo of allRepos) {
    repoCounts.set(repo.namespaceId, (repoCounts.get(repo.namespaceId) ?? 0) + 1);
  }

  const metaByNamespace = new Map<string, NamespaceDirectoryMetaRow>();
  for (const row of metaResult.results ?? []) {
    metaByNamespace.set(row.namespace_id, row);
  }

  return allNamespaces
    .map((ns): NamespaceDirectoryListing => {
      const meta = metaByNamespace.get(ns.id);
      const isPrimary = primaryAdminNamespaceId !== null && ns.id === primaryAdminNamespaceId;
      const role: DirectoryRole = isPrimary ? "admin" : (meta?.role ?? "member");
      const status: DirectoryStatus = isPrimary ? "active" : (meta?.status ?? "active");
      const displayName = sanitizeDisplayName(meta?.display_name ?? "", ns.slug);
      const lastActiveAt = meta?.last_active_at ?? meta?.updated_at ?? ns.createdAt;
      return {
        id: ns.id,
        slug: ns.slug,
        displayName,
        createdBy: ns.createdBy,
        createdAt: ns.createdAt,
        lastActiveAt,
        role,
        status,
        repoCount: repoCounts.get(ns.id) ?? 0,
        hasPassword: Boolean(meta?.password_hash),
      };
    })
    .sort((a, b) => {
      if (a.id === primaryAdminNamespaceId) return -1;
      if (b.id === primaryAdminNamespaceId) return 1;
      return a.slug.localeCompare(b.slug);
    });
}

export async function upsertNamespaceDirectoryMeta(
  d1: D1Database,
  namespaceId: string,
  meta: {
    displayName: string;
    role: DirectoryRole;
    status: DirectoryStatus;
    passwordHash?: string | null;
    lastActiveAt?: number;
    now: number;
  }
): Promise<void> {
  await ensureNamespaceDirectoryMetaTable(d1);
  const lastActiveAt = meta.lastActiveAt ?? meta.now;

  if (meta.passwordHash !== undefined) {
    await d1
      .prepare(
        `INSERT INTO namespace_directory_meta (namespace_id, display_name, role, status, password_hash, last_active_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(namespace_id) DO UPDATE SET
           display_name = excluded.display_name,
           role = excluded.role,
           status = excluded.status,
           password_hash = excluded.password_hash,
           last_active_at = excluded.last_active_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        namespaceId,
        meta.displayName,
        meta.role,
        meta.status,
        meta.passwordHash,
        lastActiveAt,
        meta.now
      )
      .run();
    return;
  }

  await d1
    .prepare(
      `INSERT INTO namespace_directory_meta (namespace_id, display_name, role, status, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace_id) DO UPDATE SET
         display_name = excluded.display_name,
         role = excluded.role,
         status = excluded.status,
         last_active_at = excluded.last_active_at,
         updated_at = excluded.updated_at`
    )
    .bind(namespaceId, meta.displayName, meta.role, meta.status, lastActiveAt, meta.now)
    .run();
}

export async function findNamespaceDirectoryMeta(
  d1: D1Database,
  namespaceId: string
): Promise<NamespaceDirectoryMetaRow | null> {
  await ensureNamespaceDirectoryMetaTable(d1);
  const row = await d1
    .prepare(
      `SELECT namespace_id, display_name, role, status, password_hash, last_active_at, updated_at
       FROM namespace_directory_meta
       WHERE namespace_id = ?
       LIMIT 1`
    )
    .bind(namespaceId)
    .first<NamespaceDirectoryMetaRow>();
  return row ?? null;
}

/**
 * Resolves a directory account by namespace slug for password authentication.
 */
export async function findDirectoryAccountBySlug(
  d1: D1Database,
  db: Db,
  slug: string
): Promise<DirectoryAuthAccount | null> {
  await ensureNamespaceDirectoryMetaTable(d1);
  const nsRows = await db.select().from(namespaces).where(eq(namespaces.slug, slug)).limit(1);
  const ns = nsRows[0];
  if (!ns) return null;

  const meta = await findNamespaceDirectoryMeta(d1, ns.id);
  return {
    userId: ns.createdBy,
    namespaceId: ns.id,
    slug: ns.slug,
    displayName: sanitizeDisplayName(meta?.display_name ?? "", ns.slug),
    role: meta?.role ?? "member",
    status: meta?.status ?? "active",
    passwordHash: meta?.password_hash ?? null,
    hasPassword: Boolean(meta?.password_hash),
  };
}

/**
 * Resolves a user's owned home directory account by `userId` for session
 * hydration (`loadViewer`) and self-service password change.
 */
export async function findDirectoryAccountByUserId(
  d1: D1Database,
  db: Db,
  userId: string
): Promise<DirectoryAuthAccount | null> {
  await ensureNamespaceDirectoryMetaTable(d1);
  const nsRows = await db.select().from(namespaces).where(eq(namespaces.createdBy, userId)).limit(1);
  const ns = nsRows[0];
  if (!ns) return null;

  const meta = await findNamespaceDirectoryMeta(d1, ns.id);
  return {
    userId: ns.createdBy,
    namespaceId: ns.id,
    slug: ns.slug,
    displayName: sanitizeDisplayName(meta?.display_name ?? "", ns.slug),
    role: meta?.role ?? "member",
    status: meta?.status ?? "active",
    passwordHash: meta?.password_hash ?? null,
    hasPassword: Boolean(meta?.password_hash),
  };
}

/**
 * Updates `last_active_at` on successful user login without altering role,
 * status, display name, or password hash.
 */
export async function touchDirectoryLastActive(
  d1: D1Database,
  namespaceId: string,
  now: number
): Promise<void> {
  await ensureNamespaceDirectoryMetaTable(d1);
  await d1
    .prepare(
      `UPDATE namespace_directory_meta
       SET last_active_at = ?, updated_at = ?
       WHERE namespace_id = ?`
    )
    .bind(now, now, namespaceId)
    .run();
}

/**
 * Updates only the stored password hash for a directory user account.
 */
export async function updateDirectoryPasswordHash(
  d1: D1Database,
  namespaceId: string,
  passwordHash: string,
  now: number
): Promise<void> {
  await ensureNamespaceDirectoryMetaTable(d1);
  await d1
    .prepare(
      `UPDATE namespace_directory_meta
       SET password_hash = ?, updated_at = ?
       WHERE namespace_id = ?`
    )
    .bind(passwordHash, now, namespaceId)
    .run();
}

/**
 * Updates a namespace's handle (`slug`) in place while preserving its stable
 * `id`, repositories, memberships, and grants. Also updates the synthetic local
 * user subject when not shared with the signed-in admin.
 */
export async function updateNamespaceHandle(
  db: Db,
  namespaceId: string,
  newSlug: string,
  createdByUserId: string,
  protectedUserId: string,
  newSubject: string
): Promise<boolean> {
  const updated = await db
    .update(namespaces)
    .set({ slug: newSlug })
    .where(eq(namespaces.id, namespaceId))
    .returning({ id: namespaces.id });

  if (updated.length === 0) return false;

  if (createdByUserId !== protectedUserId) {
    try {
      await db
        .update(users)
        .set({ tesseraSub: newSubject })
        .where(eq(users.id, createdByUserId));
    } catch {
      // Ignore subject collision if a user record with that subject already exists.
    }
  }
  return true;
}

export async function listAllRepositoriesWithNamespaces(db: Db): Promise<
  Array<{
    id: string;
    slug: string;
    namespaceId: string;
    namespaceSlug: string;
    doName: string;
    visibility: "public" | "private";
    updatedAt: number;
  }>
> {
  const rows = await db
    .select({
      id: repositories.id,
      slug: repositories.slug,
      namespaceId: repositories.namespaceId,
      namespaceSlug: namespaces.slug,
      doName: repositories.doName,
      visibility: repositories.visibility,
      updatedAt: repositories.updatedAt,
    })
    .from(repositories)
    .innerJoin(namespaces, eq(repositories.namespaceId, namespaces.id))
    .orderBy(namespaces.slug, repositories.slug);
  return rows;
}

/**
 * Deletes a non-primary namespace entry along with its repositories,
 * memberships, directory metadata, and (when no other namespaces/repos
 * reference it) its synthetic creator user row.
 */
export async function deleteNamespaceEntry(
  d1: D1Database,
  db: Db,
  namespaceId: string,
  createdByUserId: string,
  protectedUserId: string
): Promise<boolean> {
  await ensureNamespaceDirectoryMetaTable(d1);
  // Delete repos in this namespace first (cascades pat_repo_grants).
  await db.delete(repositories).where(eq(repositories.namespaceId, namespaceId));
  // Delete memberships and namespace row (cascades pat_namespace_grants + directory meta).
  await db.delete(namespaceMemberships).where(eq(namespaceMemberships.namespaceId, namespaceId));
  await d1
    .prepare(`DELETE FROM namespace_directory_meta WHERE namespace_id = ?`)
    .bind(namespaceId)
    .run();
  const deleted = await db
    .delete(namespaces)
    .where(eq(namespaces.id, namespaceId))
    .returning({ id: namespaces.id });

  if (deleted.length === 0) return false;

  // Clean up synthetic member user row if it is not the signed-in admin and no
  // longer owns any namespaces or repositories.
  if (createdByUserId !== protectedUserId) {
    const remainingOwnedNs = await db
      .select({ id: namespaces.id })
      .from(namespaces)
      .where(eq(namespaces.createdBy, createdByUserId))
      .limit(1);
    const remainingOwnedRepos = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(eq(repositories.createdBy, createdByUserId))
      .limit(1);
    if (remainingOwnedNs.length === 0 && remainingOwnedRepos.length === 0) {
      await db.delete(users).where(eq(users.id, createdByUserId));
    }
  }

  return true;
}
