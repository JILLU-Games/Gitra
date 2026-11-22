import { type Progress, ProgressBanner } from "@/client/components/ProgressBanner";
import { RepoNav } from "@/client/components/RepoNav";
import { type RepoAdminProps, RepoAdminIsland } from "@/client/islands/repo-admin";
import { IslandHost } from "@/client/server/IslandHost";

export type AdminPageProps = RepoAdminProps & {
  visibility?: "public" | "private";
  canManageRepo?: boolean;
  progress?: Progress;
};

export function AdminPage({
  progress,
  visibility,
  canManageRepo = true,
  ...props
}: AdminPageProps) {
  return (
    <div>
      <RepoNav
        owner={props.owner}
        repo={props.repo}
        refEnc={props.refEnc}
        visibility={visibility}
        currentTab="admin"
        showRefDropdown={false}
        canManageRepo={canManageRepo}
      />
      <ProgressBanner progress={progress} />
      <IslandHost name="repo-admin" props={props}>
        <RepoAdminIsland {...props} />
      </IslandHost>
    </div>
  );
}
