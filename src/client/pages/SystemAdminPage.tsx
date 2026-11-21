import { AdminSettingsLayout } from "@/client/components/AdminSettingsLayout";
import { SystemAdminIsland } from "@/client/islands/system-admin";
import type { SystemAdminIslandProps } from "@/client/islands/system-admin/types";
import { IslandHost } from "@/client/server/IslandHost";

export type SystemAdminPageProps = SystemAdminIslandProps;

export function SystemAdminPage(props: SystemAdminPageProps) {
  return (
    <AdminSettingsLayout active="overview">
      <IslandHost name="system-admin" props={props}>
        <SystemAdminIsland {...props} />
      </IslandHost>
    </AdminSettingsLayout>
  );
}
