import type { FileIconName } from "@/shared/web";
import { Breadcrumbs } from "@/client/components/Breadcrumbs";
import { EmptyState } from "@/client/components/EmptyState";
import { FileIcon } from "@/client/components/FileIcon";
import { type Progress, ProgressBanner } from "@/client/components/ProgressBanner";
import { RepoNav } from "@/client/components/RepoNav";
import {
  RepoFileCreatorIsland,
  RepoOverviewActionsIsland,
} from "@/client/islands/repo-overview-actions";
import { IslandHost } from "@/client/server/IslandHost";

type TreeEntry = {
  name: string;
  href: string;
  isDir: boolean;
  isSymlink: boolean;
  iconName: FileIconName;
  shortOid: string;
};

type Breadcrumb = {
  name: string;
  href: string | null;
};

export type TreePageProps = {
  owner: string;
  repo: string;
  visibility?: "public" | "private";
  canManageRepo?: boolean;
  repositoryId?: string;
  refShort?: string;
  currentPath?: string;
  canEditRepo?: boolean;
  refEnc: string;
  entries: TreeEntry[];
  breadcrumbs?: Breadcrumb[];
  parentHref?: string | null;
  progress?: Progress;
};

function getTreeEntryIconClass(entry: TreeEntry): string {
  if (entry.isDir) {
    return "text-accent";
  }
  if (entry.isSymlink) {
    return "text-fgBody";
  }
  return "text-fgMuted";
}

export function TreePage({
  owner,
  repo,
  visibility,
  canManageRepo = false,
  repositoryId,
  refShort,
  currentPath = "",
  canEditRepo = false,
  refEnc,
  entries,
  breadcrumbs,
  parentHref,
  progress,
}: TreePageProps) {
  const showCreator = Boolean(canEditRepo && repositoryId && refShort);

  return (
    <>
      <RepoNav
        owner={owner}
        repo={repo}
        refEnc={refEnc}
        visibility={visibility}
        currentTab="browse"
        canManageRepo={canManageRepo}
      />
      <ProgressBanner progress={progress} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Breadcrumbs items={breadcrumbs} parentHref={parentHref} />
          {showCreator && repositoryId && refShort ? (
            <IslandHost
              name="repo-overview-actions"
              props={{
                owner,
                repo,
                repositoryId,
                origin: "",
                refShort,
                canEditRepo: true,
                hasReadme: true,
                basePath: currentPath,
                showCodeDropdown: false,
              }}
            >
              <RepoOverviewActionsIsland
                owner={owner}
                repo={repo}
                repositoryId={repositoryId}
                origin=""
                refShort={refShort}
                canEditRepo={true}
                hasReadme={true}
                basePath={currentPath}
                showCodeDropdown={false}
              />
            </IslandHost>
          ) : null}
        </div>

        {showCreator && repositoryId && refShort ? (
          <IslandHost
            name="repo-file-creator"
            props={{ owner, repo, repositoryId, refShort, basePath: currentPath }}
          >
            <RepoFileCreatorIsland
              owner={owner}
              repo={repo}
              repositoryId={repositoryId}
              refShort={refShort}
              basePath={currentPath}
            />
          </IslandHost>
        ) : null}

        <div className="overflow-hidden rounded-none border border-border bg-surface">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>OID</th>
              </tr>
            </thead>
            <tbody>
              {entries.length ? (
                entries.map((entry) => (
                  <tr key={`${entry.href}-${entry.name}`}>
                    <td>
                      <FileIcon
                        name={entry.iconName}
                        className={`mr-1.5 inline-block h-4 w-4 align-[-2px] ${getTreeEntryIconClass(entry)}`}
                      />{" "}
                      <a
                        href={entry.href}
                        className="text-fg no-underline hover:text-accent hover:underline"
                      >
                        {entry.name}
                      </a>
                    </td>
                    <td className="font-mono text-[12px] text-fgMuted">{entry.shortOid}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    <EmptyState
                      icon={<FileIcon name="folder" className="h-4 w-4 text-fgMuted" />}
                      title="This tree is empty"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
