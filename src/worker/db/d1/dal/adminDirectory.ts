import { asc, eq } from "drizzle-orm";

import {
  sanitizeDisplayName,
  type DirectoryRole,
  type DirectoryStatus,
} from "@/shared/admin/panel";
import {
  buildLocalAccountSubject,
  resolveAdminAuthConfig,
  type AdminAuthEnv,
} from "@/worker/auth/adminAuth";
import type { Logger } from "@/worker/common/logger";
import type { Db } from "@/worker/db/d1/client";
import { namespaceMemberships } from "@/worker/db/d1/schema/namespaceMemberships";
import { namespaces, type NamespaceRow } from "@/worker/db/d1/schema/namespaces";
import { repositories } from "@/worker/db/d1/schema/repositories";
import { users, type UserRow } from "@/worker/db/d1/schema/users";
import { listNamespacesForUser } from "./namespaces";
import { findUserBySubject } from "./users";

export type NamespaceDirectoryMetaRow = {
  namespace_id: string;
  display_name: string;
  role: DirectoryRole;
  status: DirectoryStatus;
  password_hash: string | null;
  session_epoch: number;
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
  sessionEpoch: number;
};

export async function listAllNamespaceDirectoryEntries(
  d1: D1Database,
  db: Db,
  primaryAdminNamespaceId: string | null
): Promise<NamespaceDirectoryListing[]> {
  const [allNamespaces, allRepos, metaResult] = await Promise.all([
    db.select().from(namespaces),
    db.select({ namespaceId: repositories.namespaceId }).from(repositories),
    d1
      .prepare(
        `SELECT namespace_id, display_name, role, status, password_hash, session_epoch, last_active_at, updated_at
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
    bumpSessionEpoch?: boolean;
    lastActiveAt?: number;
    now: number;
  }
): Promise<{ sessionEpoch: number }> {
  const lastActiveAt = meta.lastActiveAt ?? meta.now;
  const initialEpoch = meta.bumpSessionEpoch ? 2 : 1;
  const epochExpr = meta.bumpSessionEpoch
    ? "namespace_directory_meta.session_epoch + 1"
    : "namespace_directory_meta.session_epoch";

  if (meta.passwordHash !== undefined) {
    const row = await d1
      .prepare(
        `INSERT INTO namespace_directory_meta (namespace_id, display_name, role, status, password_hash, session_epoch, last_active_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ${initialEpoch}, ?, ?)
         ON CONFLICT(namespace_id) DO UPDATE SET
           display_name = excluded.display_name,
           role = excluded.role,
           status = excluded.status,
           password_hash = excluded.password_hash,
           session_epoch = ${epochExpr},
           last_active_at = excluded.last_active_at,
           updated_at = excluded.updated_at
         RETURNING session_epoch`
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
      .first<{ session_epoch: number }>();
    return { sessionEpoch: row?.session_epoch ?? 1 };
  }

  const row = await d1
    .prepare(
      `INSERT INTO namespace_directory_meta (namespace_id, display_name, role, status, session_epoch, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ${initialEpoch}, ?, ?)
       ON CONFLICT(namespace_id) DO UPDATE SET
         display_name = excluded.display_name,
         role = excluded.role,
         status = excluded.status,
         session_epoch = ${epochExpr},
         last_active_at = excluded.last_active_at,
         updated_at = excluded.updated_at
       RETURNING session_epoch`
    )
    .bind(namespaceId, meta.displayName, meta.role, meta.status, lastActiveAt, meta.now)
    .first<{ session_epoch: number }>();
  return { sessionEpoch: row?.session_epoch ?? 1 };
}

export async function findNamespaceDirectoryMeta(
  d1: D1Database,
  namespaceId: string
): Promise<NamespaceDirectoryMetaRow | null> {
  const row = await d1
    .prepare(
      `SELECT namespace_id, display_name, role, status, password_hash, session_epoch, last_active_at, updated_at
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
    sessionEpoch: meta?.session_epoch ?? 1,
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
  const nsRows = await db
    .select()
    .from(namespaces)
    .where(eq(namespaces.createdBy, userId))
    .orderBy(asc(namespaces.createdAt), asc(namespaces.id))
    .limit(1);
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
    sessionEpoch: meta?.session_epoch ?? 1,
  };
}

/**
 * Returns true if at least one user account exists in D1.
 */
export async function hasAnyRegisteredUsers(d1: D1Database): Promise<boolean> {
  const row = await d1.prepare(`SELECT 1 AS found FROM users LIMIT 1`).first<{ found: number }>();
  return Boolean(row);
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
 * Updates the stored password hash for a directory user account and increments
 * `session_epoch` atomically so all prior session cookies are immediately revoked.
 */
export async function updateDirectoryPasswordHash(
  d1: D1Database,
  namespaceId: string,
  passwordHash: string,
  now: number
): Promise<{ sessionEpoch: number }> {
  const row = await d1
    .prepare(
      `UPDATE namespace_directory_meta
       SET password_hash = ?, session_epoch = session_epoch + 1, updated_at = ?
       WHERE namespace_id = ?
       RETURNING session_epoch`
    )
    .bind(passwordHash, now, namespaceId)
    .first<{ session_epoch: number }>();
  return { sessionEpoch: row?.session_epoch ?? 1 };
}

/**
 * Updates only `display_name` (creating a default directory metadata row if
 * absent) so profile edits never clobber concurrent `role` or `status` changes
 * issued from System Admin.
 */
export async function updateDirectoryDisplayName(
  d1: D1Database,
  namespaceId: string,
  meta: {
    displayName: string;
    fallbackRole: DirectoryRole;
    fallbackStatus: DirectoryStatus;
    lastActiveAt: number;
    now: number;
  }
): Promise<void> {
  await d1
    .prepare(
      `INSERT INTO namespace_directory_meta (namespace_id, display_name, role, status, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace_id) DO UPDATE SET
         display_name = excluded.display_name,
         last_active_at = COALESCE(namespace_directory_meta.last_active_at, excluded.last_active_at),
         updated_at = excluded.updated_at`
    )
    .bind(
      namespaceId,
      meta.displayName,
      meta.fallbackRole,
      meta.fallbackStatus,
      meta.lastActiveAt,
      meta.now
    )
    .run();
}

/**
 * Resolves the primary administrator's canonical public Git namespace by their
 * immutable internal auth subject (`local:<ADMIN_USERNAME>`) rather than by
 * slug, so renaming their public `@namespace` never breaks admin detection.
 */
export async function findPrimaryAdminNamespace(
  db: Db,
  adminSubject: string
): Promise<NamespaceRow | undefined> {
  const user = await findUserBySubject(db, adminSubject);
  if (!user) return undefined;

  const ownedRows = await db
    .select()
    .from(namespaces)
    .where(eq(namespaces.createdBy, user.id))
    .orderBy(asc(namespaces.createdAt), asc(namespaces.id))
    .limit(1);
  if (ownedRows[0]) return ownedRows[0];

  const memberNamespaces = await listNamespacesForUser(db, user.id);
  return memberNamespaces[0];
}

/**
 * Resolves the primary administrator user row across both env/demo mode
 * (`local:<ADMIN_USERNAME>`) and first-run Production Setup mode (where
 * `ADMIN_PASSWORD` is unset and the founder claimed a custom `@handle` via
 * `POST /auth/setup`, resulting in `local:<handle>`).
 */
export async function resolvePrimaryAdminUser(
  d1: D1Database,
  db: Db,
  env: AdminAuthEnv
): Promise<UserRow | undefined> {
  const authConfig = resolveAdminAuthConfig(env);
  const configuredSubject = buildLocalAccountSubject(authConfig.username);
  const configuredUser = await findUserBySubject(db, configuredSubject);
  if (configuredUser) {
    return configuredUser;
  }

  // Only fall back to the earliest D1-claimed local admin when ADMIN_PASSWORD
  // is unset (unconfigured Production mode using `/auth/setup`).
  if (authConfig.password !== null) {
    return undefined;
  }

  const row = await d1
    .prepare(
      `SELECT u.id AS id, u.tessera_sub AS tesseraSub, u.created_at AS createdAt
       FROM users u
       INNER JOIN namespaces n ON n.created_by = u.id
       INNER JOIN namespace_directory_meta m ON m.namespace_id = n.id
       WHERE u.tessera_sub LIKE 'local:%'
         AND m.role = 'admin'
       ORDER BY u.created_at ASC, u.id ASC
       LIMIT 1`
    )
    .first<UserRow>();
  return row ?? undefined;
}

/**
 * Resolves the primary administrator's canonical public Git namespace across
 * both env/demo mode and first-run Production Setup mode.
 */
export async function resolvePrimaryAdminNamespace(
  d1: D1Database,
  db: Db,
  env: AdminAuthEnv
): Promise<NamespaceRow | undefined> {
  const user = await resolvePrimaryAdminUser(d1, db, env);
  if (!user) return undefined;

  const ownedRows = await db
    .select()
    .from(namespaces)
    .where(eq(namespaces.createdBy, user.id))
    .orderBy(asc(namespaces.createdAt), asc(namespaces.id))
    .limit(1);
  if (ownedRows[0]) return ownedRows[0];

  const memberNamespaces = await listNamespacesForUser(db, user.id);
  return memberNamespaces[0];
}

/**
 * Updates a namespace's handle (`slug`) in place while preserving its stable
 * `id`, repositories, memberships, and grants. Also updates the synthetic local
 * user subject for regular directory users, while never mutating the signed-in
 * or primary admin's `local:` authentication subject.
 */
export async function updateNamespaceHandle(
  db: Db,
  namespaceId: string,
  newSlug: string,
  createdByUserId: string,
  protectedUserId: string,
  newSubject: string,
  options?: { skipSubjectUpdate?: boolean; log?: Logger }
): Promise<boolean> {
  const updated = await db
    .update(namespaces)
    .set({ slug: newSlug })
    .where(eq(namespaces.id, namespaceId))
    .returning({ id: namespaces.id });

  if (updated.length === 0) return false;

  if (!options?.skipSubjectUpdate && createdByUserId !== protectedUserId) {
    try {
      await db.update(users).set({ tesseraSub: newSubject }).where(eq(users.id, createdByUserId));
    } catch (error) {
      const message = String(error);
      if (/unique|constraint/i.test(message)) {
        options?.log?.warn("admin-directory:subject-collision-skipped", {
          namespaceId,
          createdByUserId,
          newSubject,
          error: message,
        });
      } else {
        options?.log?.error("admin-directory:subject-update-failed", {
          namespaceId,
          createdByUserId,
          newSubject,
          error: message,
        });
        throw error;
      }
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
  // Delete repos in this namespace first (cascades repository_meta and pat_repo_grants).
  await d1
    .prepare(
      `DELETE FROM repository_meta
       WHERE repository_id IN (SELECT id FROM repositories WHERE namespace_id = ?)`
    )
    .bind(namespaceId)
    .run();
  await db.delete(repositories).where(eq(repositories.namespaceId, namespaceId));
  // Delete memberships and namespace row (cascades pat_namespace_grants + directory/profile meta).
  await db.delete(namespaceMemberships).where(eq(namespaceMemberships.namespaceId, namespaceId));
  await d1
    .prepare(`DELETE FROM namespace_directory_meta WHERE namespace_id = ?`)
    .bind(namespaceId)
    .run();
  await d1
    .prepare(`DELETE FROM namespace_profile_meta WHERE namespace_id = ?`)
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
