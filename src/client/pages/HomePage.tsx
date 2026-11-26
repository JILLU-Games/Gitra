import { countHomeFeaturedRepositories, type DirectoryRole } from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  type SiteBrandingConfig,
} from "@/shared/branding";
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
  branding?: SiteBrandingConfig;
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
  branding,
  primaryNamespaceSlug,
  displayName,
  viewerRole = "member",
  namespaces = [],
  publicNamespaces = [],
  repositories = [],
  publicRepositories = [],
}: HomePageProps) {
  const resolvedBranding = branding ?? DEFAULT_SITE_BRANDING;
  const projectRepos = publicRepositories.filter((repo) => repo.slug !== PROFILE_REPO_SLUG);
  const openSourceProjectCount =
    projectRepos.length > 0 ? projectRepos.length : publicRepositories.length;
  const teamNamespaceCount =
    publicNamespaces.length > 0
      ? publicNamespaces.length
      : new Set(publicRepositories.map((repo) => repo.namespaceSlug)).size;
  const pinnedProjectCount = countHomeFeaturedRepositories(publicRepositories);
  const websiteDisplayLabel =
    resolvedBranding.websiteLabel || extractHostLabel(resolvedBranding.websiteUrl);

  return (
    <>
      {/* Flat Open Hero Band (No Heavy Box-in-Box) */}
      {!signedIn || exploreOnly ? (
        <section className="bg-surface border-b border-border">
          <div className="max-w-[1160px] mx-auto px-5 py-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2 text-[12px] text-fgMuted">
                  {resolvedBranding.tagline ? (
                    <>
                      <span className="text-fgBody font-medium">{resolvedBranding.tagline}</span>
                      <span>·</span>
                    </>
                  ) : null}
                  <span>Public HTTPS Git</span>
                </div>
                <h1 className="m-0 text-[20px] font-semibold text-fg tracking-tight">
                  {resolvedBranding.heroTitle}
                </h1>
                {resolvedBranding.heroDescription ? (
                  <p className="m-0 text-[13px] text-fgBody">{resolvedBranding.heroDescription}</p>
                ) : null}
              </div>

              {resolvedBranding.websiteUrl || resolvedBranding.docsUrl ? (
                <div className="flex items-center gap-2.5 shrink-0">
                  {resolvedBranding.websiteUrl ? (
                    <a
                      href={resolvedBranding.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="h-8 px-3.5 rounded-md bg-canvas hover:bg-surfaceHover border border-border text-fg text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors no-underline"
                    >
                      {websiteDisplayLabel}
                      <svg
                        className="w-3 h-3 text-fgMuted"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
                        />
                      </svg>
                    </a>
                  ) : null}
                  {resolvedBranding.docsUrl ? (
                    <a
                      href={resolvedBranding.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="h-8 px-3.5 rounded-md bg-fg hover:bg-fgHover text-canvas text-[12px] font-semibold inline-flex items-center transition-colors no-underline"
                    >
                      Documentation
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Clean Inline Metrics */}
            <div className="pt-4 border-t border-borderSubtle flex flex-wrap items-center justify-between gap-3 text-[12px] text-fgMuted">
              <div className="flex flex-wrap items-center gap-6">
                <span>
                  <strong className="text-fg font-semibold">{openSourceProjectCount}</strong> Public
                  Repositories
                </span>
                <span>
                  <strong className="text-fg font-semibold">{teamNamespaceCount}</strong> Maintainer
                  Namespaces
                </span>
                <span>
                  <strong className="text-fg font-semibold">{pinnedProjectCount}</strong> Pinned
                  Releases
                </span>
              </div>
              <span>Free public HTTPS cloning · No account required</span>
            </div>
          </div>
        </section>
      ) : null}

      {/* Main 2-Column Content */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-5 py-6">
        <IslandHost
          name="home-repos"
          props={{
            signedIn,
            exploreOnly,
            origin,
            branding: resolvedBranding,
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
            branding={resolvedBranding}
            primaryNamespaceSlug={primaryNamespaceSlug}
            displayName={displayName}
            viewerRole={viewerRole}
            namespaces={namespaces}
            publicNamespaces={publicNamespaces}
            repositories={repositories}
            publicRepositories={publicRepositories}
          />
        </IslandHost>
      </main>
    </>
  );
}
