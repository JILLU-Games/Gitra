import { ArrowRight, FolderGit2, Globe, MapPin, Search, X } from "lucide-react";

import { buildNamespaceProfileHref } from "@/shared/admin/panel";
import {
  computeNamespaceDirectoryTotals,
  formatNamespaceWebsiteHost,
  type PublicNamespaceDirectoryItem,
} from "@/shared/namespaces";

export type NamespacesPageProps = {
  namespaces: PublicNamespaceDirectoryItem[];
  totalNamespacesCount: number;
  totalPublicReposCount: number;
  totalOpenSourceReposCount: number;
  query?: string;
};

export function NamespacesPage({
  namespaces,
  totalNamespacesCount,
  totalPublicReposCount,
  totalOpenSourceReposCount,
  query = "",
}: NamespacesPageProps) {
  const trimmedQuery = query.trim();
  const isFiltered = trimmedQuery.length > 0;
  const shownTotals = computeNamespaceDirectoryTotals(namespaces);
  const displayOpenSourceTotal =
    totalOpenSourceReposCount > 0 ? totalOpenSourceReposCount : totalPublicReposCount;

  return (
    <div className="space-y-4">
      {/* Compact Header & Search Bar */}
      <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="m-0 text-[20px] font-semibold tracking-tight text-fg">Namespaces</h1>
            <span className="text-[12px] text-fgMuted tabular-nums">
              <strong className="font-medium text-fg">{totalNamespacesCount}</strong>{" "}
              {totalNamespacesCount === 1 ? "namespace" : "namespaces"}
              <span className="mx-1.5 text-border" aria-hidden="true">
                ·
              </span>
              <strong className="font-medium text-fg">{displayOpenSourceTotal}</strong> open-source{" "}
              {displayOpenSourceTotal === 1 ? "repository" : "repositories"}
            </span>
          </div>
          <p className="m-0 text-[13px] text-fgBody">
            Browse every active namespace on this forge and inspect its public open-source
            repositories.
          </p>
        </div>

        <form
          method="get"
          action="/namespaces"
          role="search"
          className="flex w-full items-center gap-2 md:w-auto"
        >
          <div className="relative flex-1 md:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fgMuted"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={trimmedQuery}
              placeholder="Filter namespaces..."
              aria-label="Filter namespaces"
              className="h-8 w-full rounded-none border border-border bg-surface pl-8 pr-3 text-[12.5px] text-fg placeholder:text-fgMuted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="h-8 shrink-0 rounded-none border border-border bg-surface px-3 text-[12px] font-medium text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            Filter
          </button>
          {isFiltered ? (
            <a
              href="/namespaces"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-none border border-border bg-canvas px-2.5 text-[12px] text-fgMuted no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
              aria-label="Clear namespace filter"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear</span>
            </a>
          ) : null}
        </form>
      </header>

      {/* Compact Directory Table/List */}
      <section
        aria-label="Namespace directory"
        className="overflow-hidden rounded-none border border-border bg-surface"
      >
        <div className="flex items-center justify-between border-b border-borderSubtle px-4 py-2.5 text-[12px] text-fgMuted">
          <span>
            {isFiltered ? (
              <>
                Showing{" "}
                <strong className="font-medium text-fg tabular-nums">{namespaces.length}</strong>{" "}
                {namespaces.length === 1 ? "match" : "matches"} for{" "}
                <span className="font-mono text-fg">&ldquo;{trimmedQuery}&rdquo;</span>
              </>
            ) : (
              <>
                All active namespaces (
                <span className="font-medium text-fg tabular-nums">
                  {shownTotals.totalNamespaces}
                </span>
                )
              </>
            )}
          </span>
          <span className="hidden sm:inline">Public / open-source repositories</span>
        </div>

        {namespaces.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <p className="m-0 text-[13.5px] font-medium text-fg">
              {isFiltered ? "No namespaces match your filter." : "No namespaces found yet."}
            </p>
            <p className="m-0 text-[12.5px] text-fgMuted">
              {isFiltered
                ? "Try a different handle or display name, or clear the search filter."
                : "Active namespaces will appear here once accounts or organizations are created."}
            </p>
            {isFiltered ? (
              <div className="pt-1">
                <a
                  href="/namespaces"
                  className="inline-flex h-8 items-center rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fg no-underline transition-colors hover:bg-surfaceHover"
                >
                  Show all namespaces
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="m-0 list-none divide-y divide-borderSubtle p-0">
            {namespaces.map((ns) => {
              const displayName = ns.displayName || ns.slug;
              const initial =
                displayName.charAt(0).toUpperCase() || ns.slug.charAt(0).toUpperCase();
              const profileHref = buildNamespaceProfileHref(ns.slug);
              const openSourceCount = ns.projectRepoCount;
              const hasExtraProfileRepo = ns.publicRepoCount > ns.projectRepoCount;
              const primaryRepoCount =
                openSourceCount > 0 || !hasExtraProfileRepo ? openSourceCount : ns.publicRepoCount;
              const websiteHost = formatNamespaceWebsiteHost(ns.website);

              return (
                <li key={ns.slug} className="m-0 p-0">
                  <a
                    href={profileHref}
                    className="group flex flex-col gap-2.5 px-4 py-3 text-inherit no-underline transition-colors hover:bg-surfaceHover focus-visible:bg-surfaceHover focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-border bg-canvas text-[13px] font-semibold text-fg"
                        aria-hidden="true"
                      >
                        {initial}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="truncate text-[14px] font-semibold text-fg transition-colors group-hover:text-accent">
                            {displayName}
                          </span>
                          <span className="font-mono text-[12px] text-fgMuted">@{ns.slug}</span>
                        </div>

                        {ns.bio ? (
                          <p className="m-0 truncate text-[12.5px] text-fgBody">{ns.bio}</p>
                        ) : null}

                        {ns.location || websiteHost ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[11.5px] text-fgMuted">
                            {ns.location ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>{ns.location}</span>
                              </span>
                            ) : null}
                            {websiteHost ? (
                              <span className="inline-flex items-center gap-1">
                                <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>{websiteHost}</span>
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-4 pl-11 sm:justify-end sm:pl-0">
                      <div className="flex items-center gap-2 text-[12px] tabular-nums">
                        <span
                          className={
                            primaryRepoCount > 0
                              ? "inline-flex items-center gap-1.5 font-medium text-fg"
                              : "inline-flex items-center gap-1.5 text-fgMuted"
                          }
                        >
                          <FolderGit2
                            className={
                              primaryRepoCount > 0
                                ? "h-3.5 w-3.5 shrink-0 text-accent"
                                : "h-3.5 w-3.5 shrink-0 text-fgMuted"
                            }
                            aria-hidden="true"
                          />
                          <span>
                            {hasExtraProfileRepo && openSourceCount > 0
                              ? `${openSourceCount} open-source`
                              : `${primaryRepoCount} ${primaryRepoCount === 1 ? "public repo" : "public repos"}`}
                          </span>
                        </span>

                        {hasExtraProfileRepo && openSourceCount > 0 ? (
                          <span className="hidden text-[11px] text-fgMuted sm:inline">
                            · {ns.publicRepoCount} public
                          </span>
                        ) : null}
                      </div>

                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-fgMuted transition-colors group-hover:text-accent">
                        <span>Profile</span>
                        <ArrowRight
                          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
