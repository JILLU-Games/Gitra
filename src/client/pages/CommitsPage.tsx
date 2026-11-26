import { Pager } from "@/client/components/Pager";
import { type Progress, ProgressBanner } from "@/client/components/ProgressBanner";
import { RepoNav } from "@/client/components/RepoNav";
import { MergeExpanderIsland } from "@/client/islands/merge-expander";
import { IslandHost } from "@/client/server/IslandHost";

type CommitView = {
  oid: string;
  shortOid: string;
  firstLine: string;
  authorName: string;
  when: string;
  isMerge?: boolean;
};

type PagerModel = {
  perPageLinks: Array<{ text: string; href: string }>;
  newerHref?: string;
  olderHref?: string;
};

export type CommitsPageProps = {
  owner: string;
  repo: string;
  visibility?: "public" | "private";
  canManageRepo?: boolean;
  ref: string;
  refEnc: string;
  commits: CommitView[];
  pager?: PagerModel;
  progress?: Progress;
};

export function CommitsPage({
  owner,
  repo,
  visibility,
  canManageRepo = false,
  ref,
  refEnc,
  commits,
  pager,
  progress,
}: CommitsPageProps) {
  const refLabel =
    ref.length === 40 ? (
      <>
        <span className="font-mono sm:hidden">{ref.slice(0, 12)}…</span>
        <span className="hidden font-mono sm:inline">{ref}</span>
      </>
    ) : (
      <span className="font-mono">{ref}</span>
    );

  return (
    <div>
      <RepoNav
        owner={owner}
        repo={repo}
        refEnc={refEnc}
        visibility={visibility}
        currentTab="commits"
        canManageRepo={canManageRepo}
      />
      <ProgressBanner progress={progress} />
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 text-[14px] font-semibold text-fg">Commits on {refLabel}</h2>
      </div>
      <Pager pager={pager} />
      <IslandHost name="merge-expander" props={{ owner, repo, commits }}>
        <MergeExpanderIsland owner={owner} repo={repo} commits={commits} />
      </IslandHost>
    </div>
  );
}
