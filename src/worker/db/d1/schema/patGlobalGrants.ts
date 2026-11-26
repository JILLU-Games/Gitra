import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { PatGrantLevel } from "./patNamespaceGrants";
import { personalAccessTokens } from "./personalAccessTokens";

// Global administrator PAT scope granting access across all namespaces.
export const patGlobalGrants = sqliteTable(
  "pat_global_grants",
  {
    patId: text("pat_id")
      .primaryKey()
      .references(() => personalAccessTokens.id, { onDelete: "cascade" }),
    level: text("level").$type<PatGrantLevel>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  () => [check("chk_pat_global_grants_level", sql`"level" IN ('pull','push')`)]
);

export type PatGlobalGrantDbRow = typeof patGlobalGrants.$inferSelect;
export type NewPatGlobalGrantDbRow = typeof patGlobalGrants.$inferInsert;
