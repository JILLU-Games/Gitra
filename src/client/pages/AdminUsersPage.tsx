import { AdminSettingsLayout } from "@/client/components/AdminSettingsLayout";
import { AdminUsersIsland } from "@/client/islands/admin-users";
import type { AdminUsersIslandProps } from "@/client/islands/admin-users/types";
import { IslandHost } from "@/client/server/IslandHost";

export type AdminUsersPageProps = AdminUsersIslandProps;

export function AdminUsersPage(props: AdminUsersPageProps) {
  return (
    <AdminSettingsLayout active="users">
      <IslandHost name="admin-users" props={props}>
        <AdminUsersIsland {...props} />
      </IslandHost>
    </AdminSettingsLayout>
  );
}
