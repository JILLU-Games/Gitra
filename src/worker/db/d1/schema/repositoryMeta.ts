import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { repositories } from "./repositories";

// Auxiliary repository presentation metadata (description, profile pin, homepage feature pin).
export const repositoryMeta = sqliteTable("repository_meta", {
  repositoryId: text("repository_id")
    .primaryKey()
    .references(() => repositories.id, { onDelete: "cascade" }),
  description: text("description").notNull().default(""),
  pinned: integer("pinned").notNull().default(0),
  homePinned: integer("home_pinned").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export type RepositoryMetaDbRow = typeof repositoryMeta.$inferSelect;
export type NewRepositoryMetaDbRow = typeof repositoryMeta.$inferInsert;
