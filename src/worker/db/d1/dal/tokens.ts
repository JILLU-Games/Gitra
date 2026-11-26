import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/worker/db/d1/client";
import { namespaces } from "@/worker/db/d1/schema/namespaces";
import {
  type NewPatNamespaceGrantRow,
  type PatGrantLevel,
  type PatNamespaceGrantRow,
  patNamespaceGrants,
} from "@/worker/db/d1/schema/patNamespaceGrants";
import {
  type NewPatRepoGrantRow,
  type PatRepoGrantRow,
  patRepoGrants,
} from "@/worker/db/d1/schema/patRepoGrants";
import {
  type NewPersonalAccessTokenRow,
  type PersonalAccessTokenRow,
  personalAccessTokens,
} from "@/worker/db/d1/schema/personalAccessTokens";
import { repositories } from "@/worker/db/d1/schema/repositories";

// Re-exporting the schema row types from the DAL keeps callers (route
// handlers, tests) on a single import surface.
export type {
  NewPersonalAccessTokenRow,
  PersonalAccessTokenRow,
} from "@/worker/db/d1/schema/personalAccessTokens";
export type { PatGrantLevel } from "@/worker/db/d1/schema/patNamespaceGrants";

// Persist a fresh PAT and its grants in one D1 batch. D1's `batch()` runs
// the statements as a single SQL transaction, so a failure on any grant
// insert rolls back the PAT row too — the table never carries an unusable
// PAT without its scopes.
export async function insertPatWithGrants(
  db: Db,
  args: {
    pat: NewPersonalAccessTokenRow;
    namespaceGrants: NewPatNamespaceGrantRow[];
    repoGrants: NewPatRepoGrantRow[];
  }
): Promise<void> {
  const statements = [
    db.insert(personalAccessTokens).values(args.pat),
    ...args.namespaceGrants.map((row) => db.insert(patNamespaceGrants).values(row)),
    ...args.repoGrants.map((row) => db.insert(patRepoGrants).values(row)),
  ];
  if (statements.length === 1) {
    await statements[0];
    return;
  }
  // Drizzle's batch typing requires a non-empty tuple; we always have at
  // least the PAT insert, plus zero or more grant inserts.
  await db.batch(statements as [(typeof statements)[0], ...typeof statements]);
}

export async function findPatByPrefix(
  db: Db,
  prefix: string
): Promise<PersonalAccessTokenRow | undefined> {
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.prefix, prefix))
    .limit(1);
  return rows[0];
}

export async function listPatsForUser(db: Db, userId: string): Promise<PersonalAccessTokenRow[]> {
  return await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, userId))
    .orderBy(desc(personalAccessTokens.createdAt));
}

export type AdminPatWithOwner = {
  pat: PersonalAccessTokenRow;
  ownerSlug?: string;
};

/**
 * Lists all Personal Access Tokens across the workspace along with each
 * owner's primary namespace `@handle` so System Admin can audit and revoke
 * any token cleanly.
 */
export async function listAllPatsWithOwners(db: Db): Promise<AdminPatWithOwner[]> {
  const [patRows, nsRows] = await Promise.all([
    db.select().from(personalAccessTokens).orderBy(desc(personalAccessTokens.createdAt)),
    db
      .select({
        createdBy: namespaces.createdBy,
        slug: namespaces.slug,
      })
      .from(namespaces)
      .orderBy(asc(namespaces.createdAt), asc(namespaces.id)),
  ]);

  const primarySlugByUser = new Map<string, string>();
  for (const ns of nsRows) {
    if (!primarySlugByUser.has(ns.createdBy)) {
      primarySlugByUser.set(ns.createdBy, ns.slug);
    }
  }

  return patRows.map((pat) => ({
    pat,
    ownerSlug: primarySlugByUser.get(pat.userId),
  }));
}

export type PatNamespaceGrantSummary = {
  patId: string;
  namespaceSlug: string;
  level: PatGrantLevel;
};

export type PatRepoGrantSummary = {
  patId: string;
  namespaceSlug: string;
  repoSlug: string;
  level: PatGrantLevel;
};

export type PatGlobalGrantRow = {
  patId: string;
  level: PatGrantLevel;
  createdAt: number;
};

export type PatGlobalGrantSummary = {
  patId: string;
  level: PatGrantLevel;
};

export async function insertPatGlobalGrant(
  d1: D1Database,
  args: { patId: string; level: PatGrantLevel; createdAt: number }
): Promise<void> {
  await d1
    .prepare(
      `INSERT INTO pat_global_grants (pat_id, level, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(pat_id) DO UPDATE SET
         level = excluded.level,
         created_at = excluded.created_at`
    )
    .bind(args.patId, args.level, args.createdAt)
    .run();
}

export async function findPatGlobalGrant(
  d1: D1Database,
  patId: string
): Promise<PatGlobalGrantRow | undefined> {
  const row = await d1
    .prepare(
      `SELECT pat_id, level, created_at
       FROM pat_global_grants
       WHERE pat_id = ?
       LIMIT 1`
    )
    .bind(patId)
    .first<{ pat_id: string; level: PatGrantLevel; created_at: number }>();
  if (!row) return undefined;
  return {
    patId: row.pat_id,
    level: row.level,
    createdAt: row.created_at,
  };
}

export async function listPatGlobalGrantsByIds(
  d1: D1Database,
  patIds: string[]
): Promise<PatGlobalGrantSummary[]> {
  if (patIds.length === 0) return [];
  const placeholders = patIds.map(() => "?").join(", ");
  const result = await d1
    .prepare(`SELECT pat_id, level FROM pat_global_grants WHERE pat_id IN (${placeholders})`)
    .bind(...patIds)
    .all<{ pat_id: string; level: PatGrantLevel }>();
  return (result.results ?? []).map((row) => ({
    patId: row.pat_id,
    level: row.level,
  }));
}

// Fetch grant graphs for a set of PAT ids in batched queries so the management
// UI can render permissions without per-row round trips.
export async function listPatGrantsByIds(
  db: Db,
  patIds: string[],
  d1?: D1Database
): Promise<{
  namespaceGrants: PatNamespaceGrantSummary[];
  repoGrants: PatRepoGrantSummary[];
  globalGrants: PatGlobalGrantSummary[];
}> {
  if (patIds.length === 0) {
    return { namespaceGrants: [], repoGrants: [], globalGrants: [] };
  }
  const [nsRows, repoRows, globalGrants] = await Promise.all([
    db
      .select({
        patId: patNamespaceGrants.patId,
        namespaceSlug: namespaces.slug,
        level: patNamespaceGrants.level,
      })
      .from(patNamespaceGrants)
      .innerJoin(namespaces, eq(patNamespaceGrants.namespaceId, namespaces.id))
      .where(inArray(patNamespaceGrants.patId, patIds)),
    db
      .select({
        patId: patRepoGrants.patId,
        namespaceSlug: namespaces.slug,
        repoSlug: repositories.slug,
        level: patRepoGrants.level,
      })
      .from(patRepoGrants)
      .innerJoin(repositories, eq(patRepoGrants.repoId, repositories.id))
      .innerJoin(namespaces, eq(repositories.namespaceId, namespaces.id))
      .where(inArray(patRepoGrants.patId, patIds)),
    d1 ? listPatGlobalGrantsByIds(d1, patIds) : Promise.resolve([]),
  ]);
  return { namespaceGrants: nsRows, repoGrants: repoRows, globalGrants };
}

export async function findPatGrantForRepo(
  db: Db,
  patId: string,
  repoId: string
): Promise<PatRepoGrantRow | undefined> {
  const rows = await db
    .select()
    .from(patRepoGrants)
    .where(and(eq(patRepoGrants.patId, patId), eq(patRepoGrants.repoId, repoId)))
    .limit(1);
  return rows[0];
}

export async function findPatGrantForNamespace(
  db: Db,
  patId: string,
  namespaceId: string
): Promise<PatNamespaceGrantRow | undefined> {
  const rows = await db
    .select()
    .from(patNamespaceGrants)
    .where(
      and(eq(patNamespaceGrants.patId, patId), eq(patNamespaceGrants.namespaceId, namespaceId))
    )
    .limit(1);
  return rows[0];
}

// Caller decides whether to call (throttle policy lives in `gitAuth.ts`).
export async function updatePatLastUsedAt(db: Db, patId: string, now: number): Promise<void> {
  await db
    .update(personalAccessTokens)
    .set({ lastUsedAt: now })
    .where(eq(personalAccessTokens.id, patId));
}

export type RevokePatResult =
  { ok: true } | { ok: false; reason: "not-found" | "not-owner" | "already-revoked" };

// Revoke a PAT but only when the caller owns it. Returning a tagged union
// keeps the route handler in charge of HTTP status mapping (404 vs 403 vs
// 200 idempotent).
export async function revokePatById(
  db: Db,
  patId: string,
  userId: string,
  now: number
): Promise<RevokePatResult> {
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.id, patId))
    .limit(1);
  const existing = rows[0];
  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.userId !== userId) return { ok: false, reason: "not-owner" };
  if (existing.revokedAt !== null) return { ok: false, reason: "already-revoked" };
  await db
    .update(personalAccessTokens)
    .set({ revokedAt: now })
    .where(and(eq(personalAccessTokens.id, patId), isNull(personalAccessTokens.revokedAt)));
  return { ok: true };
}

/**
 * Revokes any PAT regardless of owning user (intended for site-admin actions).
 */
export async function revokePatAsAdmin(
  db: Db,
  patId: string,
  now: number
): Promise<{ ok: true } | { ok: false; reason: "not-found" | "already-revoked" }> {
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.id, patId))
    .limit(1);
  const existing = rows[0];
  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.revokedAt !== null) return { ok: false, reason: "already-revoked" };
  await db
    .update(personalAccessTokens)
    .set({ revokedAt: now })
    .where(and(eq(personalAccessTokens.id, patId), isNull(personalAccessTokens.revokedAt)));
  return { ok: true };
}
