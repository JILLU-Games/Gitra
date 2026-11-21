import { GitBranch, LogIn } from "lucide-react";

import type { DirectoryRole } from "@/shared/admin/panel";
import { HomeReposIsland, type HomeRepositoryItem } from "@/client/islands/home-repos";
import { IslandHost } from "@/client/server/IslandHost";

export type HomePageProps = {
  signedIn?: boolean;
  exploreOnly?: boolean;
  origin?: string;
  primaryNamespaceSlug?: string;
  displayName?: string;
  viewerRole?: DirectoryRole;
  namespaces?: Array<{ id: string; slug: string }>;
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
  repositories = [],
  publicRepositories = [],
}: HomePageProps) {
  return (
    <div className="space-y-5">
      {/* Compact Branding Strip (shown on public homepage and Explore) */}
      {!signedIn ? (
        <section className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-5 py-4 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GitBranch
                className="h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                git-on-cloudflare
              </h1>
            </div>
            <p className="m-0 mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Edge-native Git Smart HTTP v2 hosting on Cloudflare Workers. Explore public
              repositories below or sign in to create repositories and manage tokens.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/auth"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3.5 text-xs font-medium whitespace-nowrap text-white no-underline hover:bg-accent-700"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sign in</span>
            </a>
          </div>
        </section>
      ) : (
        <header className="flex flex-col justify-between gap-2 border-b border-zinc-200 pb-3 sm:flex-row sm:items-end dark:border-zinc-800">
          <div>
            <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {exploreOnly ? "Explore Repositories" : "Repositories"}
            </h1>
            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {exploreOnly
                ? "Browse all public Git repositories hosted on this instance."
                : "Browse your repositories, copy HTTPS clone URLs, or switch to public repos."}
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
          repositories={repositories}
          publicRepositories={publicRepositories}
        />
      </IslandHost>
    </div>
  );
}
