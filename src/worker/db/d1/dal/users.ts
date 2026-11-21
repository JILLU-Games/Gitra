import { eq } from "drizzle-orm";

import type { Db } from "@/worker/db/d1/client";
import { type NewUserRow, type UserRow, users } from "@/worker/db/d1/schema/users";

export async function findUserById(db: Db, id: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function findUserBySubject(db: Db, subject: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.tesseraSub, subject)).limit(1);
  return rows[0];
}

// Legacy alias kept for existing D1 schema migration tests.
export const findUserByTesseraSub = findUserBySubject;

// Insert a fresh user row. Returns the inserted row when this call won the
// race; returns undefined when an existing row already had the same subject.
// Callers combine this with `findUserBySubject` to obtain the canonical row.
export async function insertUserIfNew(db: Db, row: NewUserRow): Promise<UserRow | undefined> {
  const inserted = await db.insert(users).values(row).onConflictDoNothing().returning();
  return inserted[0];
}
