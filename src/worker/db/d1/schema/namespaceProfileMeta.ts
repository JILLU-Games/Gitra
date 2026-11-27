import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { namespaces } from "./namespaces";

// Public profile customization metadata for a user or organization namespace.
export const namespaceProfileMeta = sqliteTable("namespace_profile_meta", {
  namespaceId: text("namespace_id")
    .primaryKey()
    .references(() => namespaces.id, { onDelete: "cascade" }),
  bio: text("bio").notNull().default(""),
  location: text("location").notNull().default(""),
  website: text("website").notNull().default(""),
  commitEmail: text("commit_email").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export type NamespaceProfileMetaDbRow = typeof namespaceProfileMeta.$inferSelect;
export type NewNamespaceProfileMetaDbRow = typeof namespaceProfileMeta.$inferInsert;
