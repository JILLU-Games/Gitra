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
        <Breadcrumbs items={breadcrumbs} parentHref={parentHref} />
        <div className="overflow-hidden rounded-md border border-border bg-surface">
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
