import { AdminSettingsLayout, type AdminNavCounts } from "@/client/components/AdminSettingsLayout";
import { AdminUsersIsland } from "@/client/islands/admin-users";
import type { AdminUsersIslandProps } from "@/client/islands/admin-users/types";
import { IslandHost } from "@/client/server/IslandHost";

export type AdminUsersPageProps = AdminUsersIslandProps & {
  counts?: AdminNavCounts;
};

export function AdminUsersPage({ counts, ...islandProps }: AdminUsersPageProps) {
  const navCounts: AdminNavCounts = {
    users: counts?.users ?? islandProps.users.length,
    repositories: counts?.repositories,
    activeTokens: counts?.activeTokens,
  };

  return (
    <AdminSettingsLayout active="users" counts={navCounts}>
      <IslandHost name="admin-users" props={islandProps}>
        <AdminUsersIsland {...islandProps} />
      </IslandHost>
    </AdminSettingsLayout>
  );
}
