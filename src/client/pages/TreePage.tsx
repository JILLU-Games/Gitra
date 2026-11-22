import type { FileIconName } from "@/shared/web";
import { Breadcrumbs } from "@/client/components/Breadcrumbs";
import { EmptyState } from "@/client/components/EmptyState";
import { FileIcon } from "@/client/components/FileIcon";
import { type Progress, ProgressBanner } from "@/client/components/ProgressBanner";
import { RepoNav } from "@/client/components/RepoNav";

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
  refEnc: string;
  entries: TreeEntry[];
  breadcrumbs?: Breadcrumb[];
  parentHref?: string | null;
  progress?: Progress;
};

function getTreeEntryIconClass(entry: TreeEntry): string {
  if (entry.isDir) {
    return "text-accent-600 dark:text-accent-400";
  }
  if (entry.isSymlink) {
    return "text-zinc-500 dark:text-zinc-300";
  }
  return "text-zinc-500 dark:text-zinc-400";
}

export function TreePage({
  owner,
  repo,
  visibility,
  canManageRepo = false,
  refEnc,
  entries,
  breadcrumbs,
  parentHref,
  progress,
}: TreePageProps) {
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
      <div>
        <span className="mb-1 inline-block text-xs font-semibold uppercase tracking-wider text-accent-500 dark:text-accent-400">
          Browse
        </span>
        <h2 className="font-display tracking-tight">Tree</h2>
        <Breadcrumbs items={breadcrumbs} parentHref={parentHref} />
        <table className="mt-4 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
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
                    <a href={entry.href}>{entry.name}</a>
                  </td>
                  <td className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {entry.shortOid}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>
                  <EmptyState
                    icon={
                      <FileIcon
                        name="folder"
                        className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
                      />
                    }
                    title="This tree is empty"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
