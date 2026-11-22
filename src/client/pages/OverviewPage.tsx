import { ArrowUpRight, BookOpen, GitBranch, Sparkles, Tag, Terminal } from "lucide-react";

import { EmptyState } from "@/client/components/EmptyState";
import { FileIcon } from "@/client/components/FileIcon";
import { MarkdownContent } from "@/client/components/MarkdownContent";
import { type Progress, ProgressBanner } from "@/client/components/ProgressBanner";
import { RepoNav } from "@/client/components/RepoNav";
import { Card } from "@/client/components/ui/card";
import { ProfileReadmeEditorIsland } from "@/client/islands/profile-readme-editor";
import { RefPickerIsland } from "@/client/islands/ref-picker";
import {
  RepoAboutCardIsland,
  RepoFileCreatorIsland,
  RepoOverviewActionsIsland,
} from "@/client/islands/repo-overview-actions";
import { IslandHost } from "@/client/server/IslandHost";
import { buildGitCloneUrl, buildNamespaceProfileHref } from "@/shared/admin/panel";
import { PROFILE_README_PATH, PROFILE_REPO_SLUG } from "@/shared/slugs";
import type { FileIconName } from "@/shared/web";

type RefLink = {
  name: string;
  displayName: string;
};

export type OverviewRootEntry = {
  name: string;
  href: string;
  isDir: boolean;
  isSymlink: boolean;
  iconName: FileIconName;
  shortOid: string;
};

export type OverviewPageProps = {
  owner: string;
  repo: string;
  repositoryId?: string;
  origin?: string;
  displayName?: string;
  description?: string;
  pinned?: boolean;
  visibility?: "public" | "private";
  defaultBranch?: string;
  refShort: string;
  refEnc: string;
  branches: RefLink[];
  tags: RefLink[];
  rootEntries?: OverviewRootEntry[];
  readmeMd?: string;
  profileReadmeMd?: string;
  profileReadmePath?: string;
  canEditRepo?: boolean;
  canManageRepo?: boolean;
  canEditProfile?: boolean;
  progress?: Progress;
};

function getEntryIconClass(entry: OverviewRootEntry): string {
  if (entry.isDir) return "text-accent-600 dark:text-accent-400";
  if (entry.isSymlink) return "text-zinc-500 dark:text-zinc-300";
  return "text-zinc-500 dark:text-zinc-400";
}

export function OverviewPage({
  owner,
  repo,
  repositoryId,
  origin = "",
  displayName,
  description = "",
  pinned = false,
  visibility = "public",
  defaultBranch,
  refShort,
  refEnc,
  branches,
  tags,
  rootEntries = [],
  readmeMd,
  profileReadmeMd,
  profileReadmePath,
  canEditRepo = false,
  canManageRepo = canEditRepo,
  canEditProfile = false,
  progress,
}: OverviewPageProps) {
  const isProfileRepo = repo === PROFILE_REPO_SLUG;
  const profileHref = buildNamespaceProfileHref(owner);
  const resolvedDefaultBranch = defaultBranch || refShort || "main";
  const cloneUrl = buildGitCloneUrl(origin || "https://git.example.com", owner, repo);
  const isEmptyRepo = rootEntries.length === 0 && branches.length === 0;

  return (
    <>
      <RepoNav
        owner={owner}
        repo={repo}
        refEnc={refEnc}
        visibility={visibility}
        currentTab="overview"
        showRefDropdown={false}
        canManageRepo={canManageRepo}
      />
      <ProgressBanner progress={progress} />

      {isProfileRepo ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent-500/30 bg-accent-500/10 px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
            <Sparkles
              className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
              aria-hidden="true"
            />
            <span>
              <strong>Namespace Profile Repository:</strong> files in{" "}
              <code className="font-mono">{PROFILE_README_PATH}</code> design your public{" "}
              <span className="font-mono">@{owner}</span> profile page.
            </span>
          </div>
          <a
            href={profileHref}
            className="inline-flex h-7 items-center gap-1 rounded border border-accent-500/40 bg-white px-2.5 text-xs font-medium text-accent-700 no-underline hover:bg-zinc-50 dark:bg-zinc-900 dark:text-accent-300 dark:hover:bg-zinc-800"
          >
            <span>Open @{owner} profile</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] [&>*]:min-w-0">
        {/* Main Code Column: Action Bar + Root File Tree + README */}
        <div className="min-w-0 space-y-4">
          {/* Code Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <IslandHost
                name="ref-picker"
                props={{ owner, repo, currentRef: refShort }}
                className="relative"
              >
                <RefPickerIsland owner={owner} repo={repo} currentRef={refShort} />
              </IslandHost>

              <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                <GitBranch className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
                  {branches.length}
                </span>
                <span>{branches.length === 1 ? "branch" : "branches"}</span>
              </span>

              <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                <Tag className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
                  {tags.length}
                </span>
                <span>{tags.length === 1 ? "tag" : "tags"}</span>
              </span>
            </div>

            <IslandHost
              name="repo-overview-actions"
              props={{
                owner,
                repo,
                repositoryId,
                origin,
                refShort,
                canEditRepo,
                hasReadme: Boolean(readmeMd),
              }}
            >
              <RepoOverviewActionsIsland
                owner={owner}
                repo={repo}
                repositoryId={repositoryId}
                origin={origin}
                refShort={refShort}
                canEditRepo={canEditRepo}
                hasReadme={Boolean(readmeMd)}
              />
            </IslandHost>
          </div>

          {canEditRepo && repositoryId ? (
            <IslandHost name="repo-file-creator" props={{ owner, repo, repositoryId, refShort }}>
              <RepoFileCreatorIsland
                owner={owner}
                repo={repo}
                repositoryId={repositoryId}
                refShort={refShort}
              />
            </IslandHost>
          ) : null}

          {isProfileRepo && canEditProfile && repositoryId ? (
            <IslandHost
              name="profile-readme-editor"
              props={{
                repositoryId,
                owner,
                displayName,
                refShort,
                initialContent: profileReadmeMd || "",
                initialPath: profileReadmePath || PROFILE_README_PATH,
                hasExistingFile: Boolean(profileReadmeMd),
              }}
            >
              <ProfileReadmeEditorIsland
                repositoryId={repositoryId}
                owner={owner}
                displayName={displayName}
                refShort={refShort}
                initialContent={profileReadmeMd || ""}
                initialPath={profileReadmePath || PROFILE_README_PATH}
                hasExistingFile={Boolean(profileReadmeMd)}
              />
            </IslandHost>
          ) : null}

          {/* Root File & Directory Tree */}
          {rootEntries.length > 0 ? (
            <section
              aria-label="Repository files"
              className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                  <GitBranch
                    className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                    aria-hidden="true"
                  />
                  <span className="font-mono font-medium">{refShort}</span>
                  <span className="text-zinc-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                    {rootEntries.length} {rootEntries.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <a
                  href={`/${owner}/${repo}/tree?ref=${refEnc}`}
                  className="text-zinc-600 no-underline hover:text-accent-600 dark:text-zinc-400 dark:hover:text-accent-400"
                >
                  Browse tree
                </a>
              </div>

              <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
                {rootEntries.map((entry) => (
                  <li
                    key={`${entry.name}-${entry.shortOid}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px] transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/35"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileIcon
                        name={entry.iconName}
                        className={`h-4 w-4 shrink-0 ${getEntryIconClass(entry)}`}
                      />
                      <a
                        href={entry.href}
                        className="truncate text-zinc-900 no-underline hover:text-accent-600 hover:underline dark:text-zinc-100 dark:hover:text-accent-400"
                      >
                        {entry.name}
                      </a>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                      {entry.shortOid}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : isEmptyRepo ? (
            <section
              aria-label="Quick setup"
              className="rounded-md border border-zinc-200 bg-white p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                <Terminal
                  className="h-4 w-4 text-accent-600 dark:text-accent-400"
                  aria-hidden="true"
                />
                <span>Quick setup — empty repository</span>
              </div>
              <p className="m-0 mb-3 text-zinc-600 dark:text-zinc-400">
                {canEditRepo
                  ? "Use Add README or Add file above to initialize this repository directly in the browser, or push from your terminal:"
                  : "Push an existing Git repository or clone once commits are published:"}
              </p>
              <pre className="m-0 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                {[
                  `git init`,
                  `git branch -M ${resolvedDefaultBranch}`,
                  `git remote add origin ${cloneUrl}`,
                  `git push -u origin ${resolvedDefaultBranch}`,
                ].join("\n")}
              </pre>
            </section>
          ) : null}

          {/* README below file tree */}
          {readmeMd ? (
            <section
              aria-label="README"
              className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-2 font-mono text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200">
                <BookOpen
                  className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                  aria-hidden="true"
                />
                <span>README.md</span>
              </div>
              <div className="p-4">
                <MarkdownContent
                  markdown={readmeMd}
                  context={{ owner, repo, ref: refShort, baseDir: "" }}
                />
              </div>
            </section>
          ) : isProfileRepo && profileReadmeMd && !canEditProfile ? (
            <Card>
              <div className="mb-3 border-b border-zinc-200 pb-2 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                {profileReadmePath || PROFILE_README_PATH}
              </div>
              <div className="markdown-compact">
                <MarkdownContent
                  markdown={profileReadmeMd}
                  context={{ owner, repo, ref: refShort, baseDir: "profile" }}
                />
              </div>
            </Card>
          ) : !isEmptyRepo && (!isProfileRepo || !canEditProfile) ? (
            <Card>
              <EmptyState
                icon={
                  <BookOpen
                    className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                }
                title="No README found"
                detail={
                  isProfileRepo
                    ? `Add ${PROFILE_README_PATH} to customize this namespace profile.`
                    : "Add a README.md to the root of your repository."
                }
              />
            </Card>
          ) : null}
        </div>

        {/* Right Sidebar: About + Branches/Tags */}
        <aside className="space-y-4">
          <IslandHost
            name="repo-about-card"
            props={{
              owner,
              repo,
              repositoryId,
              initialDescription: description,
              initialPinned: pinned,
              visibility,
              defaultBranch: resolvedDefaultBranch,
              branchCount: branches.length,
              tagCount: tags.length,
              canEditRepo,
            }}
          >
            <RepoAboutCardIsland
              owner={owner}
              repo={repo}
              repositoryId={repositoryId}
              initialDescription={description}
              initialPinned={pinned}
              visibility={visibility}
              defaultBranch={resolvedDefaultBranch}
              branchCount={branches.length}
              tagCount={tags.length}
              canEditRepo={canEditRepo}
            />
          </IslandHost>

          <section
            aria-label="Branches and tags"
            className="rounded-md border border-zinc-200 bg-white p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3 className="m-0 mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <GitBranch className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
              <span>Branches</span>
            </h3>
            {branches.length ? (
              <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
                {branches.map((branch) => (
                  <li key={branch.name} className="py-1.5">
                    <a
                      href={`/${owner}/${repo}/tree?ref=${branch.name}`}
                      className="font-mono text-xs text-zinc-700 no-underline hover:text-accent-600 dark:text-zinc-300 dark:hover:text-accent-400"
                    >
                      {branch.displayName}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">No branches yet</p>
            )}

            {tags.length > 0 ? (
              <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <h4 className="m-0 mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <Tag className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
                  <span>Tags</span>
                </h4>
                <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
                  {tags.map((tag) => (
                    <li key={tag.name} className="py-1.5">
                      <a
                        href={`/${owner}/${repo}/tree?ref=${tag.name}`}
                        className="font-mono text-xs text-zinc-700 no-underline hover:text-accent-600 dark:text-zinc-300 dark:hover:text-accent-400"
                      >
                        {tag.displayName}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
