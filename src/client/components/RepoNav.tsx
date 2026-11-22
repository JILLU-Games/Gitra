import { BookMarked, Code2, GitCommitHorizontal, Lock, Settings } from "lucide-react";

import { RefPickerIsland } from "@/client/islands/ref-picker";
import { IslandHost } from "@/client/server/IslandHost";
import { buildNamespaceProfileHref } from "@/shared/admin/panel";

function decodeRef(refEnc: string): string {
  try {
    return decodeURIComponent(refEnc);
  } catch {
    return refEnc;
  }
}

type RepoNavProps = {
  owner: string;
  repo: string;
  refEnc?: string;
  visibility?: "public" | "private";
  currentTab?: "overview" | "browse" | "commits" | "admin";
  showRefDropdown?: boolean;
  canManageRepo?: boolean;
};

const tabBase =
  "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-normal whitespace-nowrap text-zinc-600 no-underline transition-colors hover:border-zinc-300 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100";

const tabActive =
  "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-accent-500 px-3 py-2 text-[13px] font-medium whitespace-nowrap text-zinc-950 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 dark:text-zinc-50";

export function RepoNav({
  owner,
  repo,
  refEnc,
  visibility,
  currentTab = "overview",
  showRefDropdown = true,
  canManageRepo = false,
}: RepoNavProps) {
  const decodedRef = refEnc ? decodeRef(refEnc) : "";
  const isCodeActive = currentTab === "overview" || currentTab === "browse";
  const codeHref = refEnc ? `/${owner}/${repo}?ref=${refEnc}` : `/${owner}/${repo}`;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-base">
          {visibility === "private" ? (
            <Lock
              className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
          ) : (
            <BookMarked
              className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <a
              href={buildNamespaceProfileHref(owner)}
              className="font-normal text-zinc-600 no-underline hover:text-accent-600 hover:underline dark:text-zinc-400 dark:hover:text-accent-400"
            >
              {owner}
            </a>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <a
              href={`/${owner}/${repo}`}
              className="font-semibold tracking-tight text-zinc-950 no-underline hover:text-accent-600 hover:underline dark:text-zinc-100 dark:hover:text-accent-400"
            >
              {repo}
            </a>
          </div>
          {visibility ? (
            <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium capitalize text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {visibility}
            </span>
          ) : null}
        </div>

        {refEnc && showRefDropdown ? (
          <IslandHost
            name="ref-picker"
            props={{ owner, repo, currentRef: decodedRef }}
            className="relative"
          >
            <RefPickerIsland owner={owner} repo={repo} currentRef={decodedRef} />
          </IslandHost>
        ) : null}
      </div>

      {refEnc ? (
        <nav
          className="-mb-px flex items-center gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
          aria-label="Repository navigation"
        >
          <a
            href={codeHref}
            className={isCodeActive ? tabActive : tabBase}
            aria-current={isCodeActive ? "page" : undefined}
          >
            <Code2
              className={`h-4 w-4 shrink-0 ${
                isCodeActive
                  ? "text-zinc-950 dark:text-zinc-100"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
              aria-hidden="true"
            />
            <span>Code</span>
          </a>
          <a
            href={`/${owner}/${repo}/commits?ref=${refEnc}`}
            className={currentTab === "commits" ? tabActive : tabBase}
            aria-current={currentTab === "commits" ? "page" : undefined}
          >
            <GitCommitHorizontal
              className={`h-4 w-4 shrink-0 ${
                currentTab === "commits"
                  ? "text-zinc-950 dark:text-zinc-100"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
              aria-hidden="true"
            />
            <span>Commits</span>
          </a>
          {canManageRepo ? (
            <a
              href={`/${owner}/${repo}/admin`}
              className={currentTab === "admin" ? tabActive : tabBase}
              aria-current={currentTab === "admin" ? "page" : undefined}
            >
              <Settings
                className={`h-4 w-4 shrink-0 ${
                  currentTab === "admin"
                    ? "text-zinc-950 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
                aria-hidden="true"
              />
              <span>Settings</span>
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
