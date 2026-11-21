import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Global user identity. The underlying `tessera_sub` SQL column name is kept
// for backward compatibility with existing D1 migrations and stores the
// account's unique local subject identifier (for example `local:admin`).
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  tesseraSub: text("tessera_sub").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
