import type { AdminNamespaceEntry } from "@/shared/admin/panel";

export type AdminUsersIslandProps = {
  primaryNamespaceSlug?: string;
  primaryPasswordManagedByEnv?: boolean;
  users: AdminNamespaceEntry[];
};
