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
  "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-normal whitespace-nowrap text-fgMuted no-underline transition-colors hover:border-border hover:text-fg";

const tabActive =
  "inline-flex shrink-0 items-center gap-1.5 border-b-2 border-fg px-3 py-2 text-[13px] font-medium whitespace-nowrap text-fg no-underline";

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
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[14px]">
          {visibility === "private" ? (
            <Lock className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
          ) : (
            <BookMarked className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <a
              href={buildNamespaceProfileHref(owner)}
              className="font-normal text-fgMuted no-underline hover:text-accent hover:underline"
            >
              {owner}
            </a>
            <span className="text-fgMuted">/</span>
            <a
              href={`/${owner}/${repo}`}
              className="font-semibold tracking-tight text-fg no-underline hover:text-accent hover:underline"
            >
              {repo}
            </a>
          </div>
          {visibility ? (
            <span className="inline-flex items-center rounded border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium capitalize text-fgMuted">
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
          className="-mb-px flex items-center gap-1 overflow-x-auto border-b border-border"
          aria-label="Repository navigation"
        >
          <a
            href={codeHref}
            className={isCodeActive ? tabActive : tabBase}
            aria-current={isCodeActive ? "page" : undefined}
          >
            <Code2
              className={`h-3.5 w-3.5 shrink-0 ${isCodeActive ? "text-fg" : "text-fgMuted"}`}
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
              className={`h-3.5 w-3.5 shrink-0 ${
                currentTab === "commits" ? "text-fg" : "text-fgMuted"
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
                className={`h-3.5 w-3.5 shrink-0 ${
                  currentTab === "admin" ? "text-fg" : "text-fgMuted"
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
