import {
  Building2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Lock,
  LogIn,
  Sparkles,
  Users,
} from "lucide-react";

import type { DirectoryRole } from "@/shared/admin/panel";
import { PROFILE_REPO_SLUG } from "@/shared/slugs";
import {
  HomeReposIsland,
  type HomeRepositoryItem,
  type PublicNamespaceItem,
} from "@/client/islands/home-repos";
import { IslandHost } from "@/client/server/IslandHost";

export type HomePageProps = {
  signedIn?: boolean;
  exploreOnly?: boolean;
  origin?: string;
  primaryNamespaceSlug?: string;
  displayName?: string;
  viewerRole?: DirectoryRole;
  namespaces?: Array<{ id: string; slug: string }>;
  publicNamespaces?: PublicNamespaceItem[];
  repositories?: HomeRepositoryItem[];
  publicRepositories?: HomeRepositoryItem[];
};

export function HomePage({
  signedIn = false,
  exploreOnly = false,
  origin = "",
  primaryNamespaceSlug,
  displayName,
  viewerRole = "member",
  namespaces = [],
  publicNamespaces = [],
  repositories = [],
  publicRepositories = [],
}: HomePageProps) {
  const projectRepos = publicRepositories.filter((repo) => repo.slug !== PROFILE_REPO_SLUG);
  const openSourceProjectCount =
    projectRepos.length > 0 ? projectRepos.length : publicRepositories.length;
  const teamNamespaceCount =
    publicNamespaces.length > 0
      ? publicNamespaces.length
      : new Set(publicRepositories.map((repo) => repo.namespaceSlug)).size;
  const pinnedProjectCount = projectRepos.filter((repo) => repo.pinned).length;

  return (
    <div className="space-y-4">
      {/* Personalized Company Open-Source & Engineering Portal Hero (shown on public homepage and Explore) */}
      {!signedIn || exploreOnly ? (
        <section
          aria-label="Organization Open-Source Portal"
          className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col justify-between gap-4 px-4 py-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-500/35 bg-accent-500/10 px-2 py-0.5 text-[11px] font-semibold text-accent-700 dark:border-accent-400/35 dark:bg-accent-500/15 dark:text-accent-300">
                  <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Vib Tools · Official Open-Source &amp; Engineering Forge</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-100/80 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">
                  <GitBranch
                    className="h-3 w-3 shrink-0 text-accent-600 dark:text-accent-400"
                    aria-hidden="true"
                  />
                  <span>git-on-cloudflare</span>
                </span>
              </div>

              <h1 className="m-0 font-display text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl dark:text-zinc-100">
                {exploreOnly
                  ? "Explore Vib Tools Open-Source Repositories"
                  : "Vib Tools Open-Source & Team Repositories"}
              </h1>

              <p className="m-0 max-w-3xl text-[13px] leading-5 text-zinc-700 dark:text-zinc-300">
                Practical software for real workflows. Browse our public open-source repositories,
                edge-native developer frameworks, and product team namespaces below—or sign in to
                access private company backups and internal team workspaces.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <a
                href="https://vibtools.io/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300/90 bg-zinc-50 px-3 text-xs font-medium whitespace-nowrap text-zinc-800 no-underline transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <span>vibtools.io</span>
                <ExternalLink
                  className="h-3 w-3 text-zinc-500 dark:text-zinc-300"
                  aria-hidden="true"
                />
              </a>

              {!signedIn ? (
                <a
                  href="/auth"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3.5 text-xs font-semibold whitespace-nowrap text-white no-underline transition-colors hover:bg-accent-700 dark:border-accent-500 dark:bg-accent-600 dark:hover:bg-accent-500"
                >
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Team Sign in</span>
                </a>
              ) : null}
            </div>
          </div>

          {/* Live Company Engineering & Open-Source Metrics Strip */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-zinc-200 bg-zinc-50/90 px-4 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/35 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2
                className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold text-zinc-950 tabular-nums dark:text-zinc-100">
                  {openSourceProjectCount}
                </strong>{" "}
                Open-Source {openSourceProjectCount === 1 ? "Project" : "Projects"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Users
                className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold text-zinc-950 tabular-nums dark:text-zinc-100">
                  {teamNamespaceCount}
                </strong>{" "}
                Active {teamNamespaceCount === 1 ? "Team Namespace" : "Teams & Namespaces"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Sparkles
                className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <span>
                {pinnedProjectCount > 0 ? (
                  <>
                    <strong className="font-semibold text-zinc-950 tabular-nums dark:text-zinc-100">
                      {pinnedProjectCount}
                    </strong>{" "}
                    Featured {pinnedProjectCount === 1 ? "Release" : "Releases"}
                  </>
                ) : (
                  "Git Smart HTTP v2 · Edge-Native"
                )}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <Lock
                className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span>Private Company Backups Protected</span>
            </span>
          </div>
        </section>
      ) : (
        <header className="flex flex-col justify-between gap-2 border-b border-zinc-200 pb-3 sm:flex-row sm:items-end dark:border-zinc-800">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-accent-500/35 bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent-700 dark:border-accent-400/35 dark:bg-accent-500/15 dark:text-accent-300">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                <span>Vib Tools Workspace</span>
              </span>
            </div>
            <h1 className="m-0 font-display text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              Repositories
            </h1>
            <p className="m-0 mt-0.5 text-[13px] text-zinc-600 dark:text-zinc-300">
              Manage your team namespaces, private organization backups, and public open-source
              repositories.
            </p>
          </div>
        </header>
      )}

      <IslandHost
        name="home-repos"
        props={{
          signedIn,
          exploreOnly,
          origin,
          primaryNamespaceSlug,
          displayName,
          viewerRole,
          namespaces,
          publicNamespaces,
          repositories,
          publicRepositories,
        }}
      >
        <HomeReposIsland
          signedIn={signedIn}
          exploreOnly={exploreOnly}
          origin={origin}
          primaryNamespaceSlug={primaryNamespaceSlug}
          displayName={displayName}
          viewerRole={viewerRole}
          namespaces={namespaces}
          publicNamespaces={publicNamespaces}
          repositories={repositories}
          publicRepositories={publicRepositories}
        />
      </IslandHost>
    </div>
  );
}
