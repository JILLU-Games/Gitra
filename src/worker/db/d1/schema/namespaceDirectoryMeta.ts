import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { DirectoryRole, DirectoryStatus } from "@/shared/admin/panel";
import { namespaces } from "./namespaces";

// Directory metadata for Admin Panel user/namespace roles, active/disabled
// status, local password hashes, and activity timestamps.
export const namespaceDirectoryMeta = sqliteTable(
  "namespace_directory_meta",
  {
    namespaceId: text("namespace_id")
      .primaryKey()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull().default(""),
    role: text("role").$type<DirectoryRole>().notNull().default("member"),
    status: text("status").$type<DirectoryStatus>().notNull().default("active"),
    passwordHash: text("password_hash"),
    lastActiveAt: integer("last_active_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  () => [
    check("chk_namespace_directory_role", sql`"role" IN ('admin','member','viewer')`),
    check("chk_namespace_directory_status", sql`"status" IN ('active','disabled')`),
  ]
);

export type NamespaceDirectoryMetaDbRow = typeof namespaceDirectoryMeta.$inferSelect;
export type NewNamespaceDirectoryMetaDbRow = typeof namespaceDirectoryMeta.$inferInsert;
