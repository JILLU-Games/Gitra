import { RepoNav } from "@/client/components/RepoNav";
import { Card } from "@/client/components/ui/card";
import { CommitDiffExpanderIsland } from "@/client/islands/commit-diff-expander";
import { IslandHost } from "@/client/server/IslandHost";

type Parent = {
  oid: string;
  short: string;
};

type DiffEntry = {
  path: string;
  changeType: "A" | "M" | "D";
  oldOid?: string;
  newOid?: string;
  oldMode?: string;
  newMode?: string;
};

type DiffSummary = {
  added: number;
  modified: number;
  deleted: number;
  total: number;
};

export type CommitPageProps = {
  owner: string;
  repo: string;
  visibility?: "public" | "private";
  canManageRepo?: boolean;
  commitOid: string;
  refEnc: string;
  commitShort: string;
  authorName: string;
  authorEmail: string;
  when: string;
  parents: Parent[];
  treeShort: string;
  message: string;
  diffBaseRefEnc: string;
  diffCompareMode: "root" | "first-parent";
  diffEntries: DiffEntry[];
  diffSummary: DiffSummary;
  diffTruncated: boolean;
  diffTruncateReason: "" | "max_files" | "max_tree_pairs" | "time_budget" | "soft_budget";
};

export function CommitPage({
  owner,
  repo,
  visibility,
  canManageRepo = false,
  commitOid,
  refEnc,
  commitShort,
  authorName,
  authorEmail,
  when,
  parents,
  treeShort,
  message,
  diffBaseRefEnc,
  diffCompareMode,
  diffEntries,
  diffSummary,
  diffTruncated,
  diffTruncateReason,
}: CommitPageProps) {
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
      <div className="mb-3 flex items-center gap-2">
        <h2 className="m-0 text-[14px] font-semibold text-fg">
          Commit <span className="font-mono">{commitShort}</span>
        </h2>
      </div>

      <div className="space-y-3">
        <Card>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] [&>dd]:m-0 [&>dd]:min-w-0">
            <dt className="font-medium text-fgMuted">Author</dt>
            <dd className="text-fg">
              {authorName} &lt;{authorEmail}&gt; <span className="text-fgMuted">{when}</span>
            </dd>
            <dt className="font-medium text-fgMuted">Parents</dt>
            <dd>
              {parents.length ? (
                parents.map((parent, index) => (
                  <span key={parent.oid}>
                    {index > 0 ? ", " : null}
                    <a
                      href={`/${owner}/${repo}/commit/${parent.oid}`}
                      className="font-mono text-[12px] text-accent no-underline hover:underline"
                    >
                      {parent.short}
                    </a>
                  </span>
                ))
              ) : (
                <span className="text-fgMuted">(root commit)</span>
              )}
            </dd>
            <dt className="font-medium text-fgMuted">Tree</dt>
            <dd>
              <a
                href={`/${owner}/${repo}/tree?ref=${refEnc}`}
                className="font-mono text-[12px] text-accent no-underline hover:underline"
              >
                {treeShort}
              </a>
            </dd>
          </dl>
        </Card>
        <Card>
          <pre className="!m-0 whitespace-pre-wrap !rounded-none !border-0 !bg-transparent !p-0 font-mono text-[12px] text-fg">
            {message}
          </pre>
        </Card>
      </div>

      <h3 className="mt-5 mb-2.5 text-[14px] font-semibold text-fg">Files changed</h3>
      <IslandHost
        name="commit-diff-expander"
        props={{
          owner,
          repo,
          commitOid,
          refEnc,
          diffBaseRefEnc,
          diffCompareMode,
          diffEntries,
          diffSummary,
          diffTruncated,
          diffTruncateReason,
          parentsCount: parents.length,
        }}
      >
        <CommitDiffExpanderIsland
          owner={owner}
          repo={repo}
          commitOid={commitOid}
          refEnc={refEnc}
          diffBaseRefEnc={diffBaseRefEnc}
          diffCompareMode={diffCompareMode}
          diffEntries={diffEntries}
          diffSummary={diffSummary}
          diffTruncated={diffTruncated}
          diffTruncateReason={diffTruncateReason}
          parentsCount={parents.length}
        />
      </IslandHost>
    </div>
  );
}
