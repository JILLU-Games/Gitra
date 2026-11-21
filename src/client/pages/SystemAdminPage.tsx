import { AdminSettingsLayout } from "@/client/components/AdminSettingsLayout";
import { SystemAdminIsland } from "@/client/islands/system-admin";
import type { SystemAdminIslandProps } from "@/client/islands/system-admin/types";
import { IslandHost } from "@/client/server/IslandHost";

export type SystemAdminPageProps = SystemAdminIslandProps;

export function SystemAdminPage(props: SystemAdminPageProps) {
  const activeSection = props.activeSection ?? "overview";
  const counts = {
    users: props.namespaces.length,
    repositories: props.repositories.length,
    activeTokens: props.tokens.filter((t) => !t.revokedAt).length,
  };

  return (
    <AdminSettingsLayout active={activeSection} counts={counts}>
      <IslandHost name="system-admin" props={props}>
        <SystemAdminIsland {...props} />
      </IslandHost>
    </AdminSettingsLayout>
  );
}
