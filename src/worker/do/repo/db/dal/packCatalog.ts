import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { PackCatalogRow } from "../schema";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { packCatalog } from "../schema";
import { SAFE_ROWS_1COL } from "./shared";

export async function getPackCatalogCount(db: DrizzleSqliteDODatabase): Promise<number> {
  return await db.$count(packCatalog);
}

/** Count only active (non-superseded) packs — used by idle cleanup to determine repo emptiness. */
export async function getActivePackCatalogCount(db: DrizzleSqliteDODatabase): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(packCatalog)
    .where(eq(packCatalog.state, "active"));
  return rows[0]?.count ?? 0;
}

export async function listPackCatalog(db: DrizzleSqliteDODatabase): Promise<PackCatalogRow[]> {
  return await db
    .select()
    .from(packCatalog)
    .orderBy(desc(packCatalog.seqHi), desc(packCatalog.tier));
}

export function listActivePackCatalogSync(db: DrizzleSqliteDODatabase): PackCatalogRow[] {
  return db
    .select()
    .from(packCatalog)
    .where(eq(packCatalog.state, "active"))
    .orderBy(desc(packCatalog.seqHi), desc(packCatalog.tier))
    .all();
}

export async function listActivePackCatalog(
  db: DrizzleSqliteDODatabase
): Promise<PackCatalogRow[]> {
  return listActivePackCatalogSync(db);
}

export function getPackCatalogRowSync(
  db: DrizzleSqliteDODatabase,
  packKey: string
): PackCatalogRow | undefined {
  const rows = db.select().from(packCatalog).where(eq(packCatalog.packKey, packKey)).limit(1).all();
  return rows[0];
}

export async function getPackCatalogRow(
  db: DrizzleSqliteDODatabase,
  packKey: string
): Promise<PackCatalogRow | undefined> {
  return getPackCatalogRowSync(db, packKey);
}

export async function getPackCatalogSeqMax(db: DrizzleSqliteDODatabase): Promise<number> {
  const rows = await db
    .select({
      maxSeqHi: sql<number>`coalesce(max(${packCatalog.seqHi}), 0)`,
    })
    .from(packCatalog);
  return rows[0]?.maxSeqHi || 0;
}

export function upsertPackCatalogRowSync(db: DrizzleSqliteDODatabase, row: PackCatalogRow): void {
  db.insert(packCatalog)
    .values(row)
    .onConflictDoUpdate({
      target: packCatalog.packKey,
      set: {
        kind: row.kind,
        state: row.state,
        tier: row.tier,
        seqLo: row.seqLo,
        seqHi: row.seqHi,
        objectCount: row.objectCount,
        packBytes: row.packBytes,
        idxBytes: row.idxBytes,
        createdAt: row.createdAt,
        supersededBy: row.supersededBy,
      },
    })
    .run();
}

export async function upsertPackCatalogRow(
  db: DrizzleSqliteDODatabase,
  row: PackCatalogRow
): Promise<void> {
  upsertPackCatalogRowSync(db, row);
}

export function supersedePackCatalogRowsSync(
  db: DrizzleSqliteDODatabase,
  packKeys: string[],
  supersededBy: string | null = null
): void {
  if (!packKeys.length) return;
  for (let i = 0; i < packKeys.length; i += SAFE_ROWS_1COL) {
    const batch = packKeys.slice(i, i + SAFE_ROWS_1COL);
    db.update(packCatalog)
      .set({ state: "superseded", supersededBy })
      .where(inArray(packCatalog.packKey, batch))
      .run();
  }
}

export async function supersedePackCatalogRows(
  db: DrizzleSqliteDODatabase,
  packKeys: string[],
  supersededBy: string | null = null
): Promise<void> {
  supersedePackCatalogRowsSync(db, packKeys, supersededBy);
}

export async function deletePackCatalogRows(
  db: DrizzleSqliteDODatabase,
  packKeys: string[]
): Promise<void> {
  if (!packKeys.length) return;
  for (let i = 0; i < packKeys.length; i += SAFE_ROWS_1COL) {
    const batch = packKeys.slice(i, i + SAFE_ROWS_1COL);
    await db.delete(packCatalog).where(inArray(packCatalog.packKey, batch));
  }
}
