import type { AdminNamespaceEntry } from "@/shared/admin/panel";

export type AdminUsersIslandProps = {
  primaryNamespaceSlug?: string;
  users: AdminNamespaceEntry[];
};
