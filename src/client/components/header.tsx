import { HeaderMenusIsland } from "@/client/islands/header-menus";
import { ThemeToggleIsland } from "@/client/islands/theme-toggle";
import { IslandHost } from "@/client/server/IslandHost";
import type { Viewer } from "@/client/server/viewer";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  type SiteBrandingConfig,
} from "@/shared/branding";

type HeaderProps = {
  currentView?: string;
  viewer?: Viewer | null;
  branding?: SiteBrandingConfig;
  origin?: string;
};

export function Header({ currentView, viewer, branding, origin }: HeaderProps) {
  const resolvedBranding = branding ?? DEFAULT_SITE_BRANDING;
  const hostLabel = extractHostLabel(origin, resolvedBranding.websiteUrl);
  const handle = viewer?.primaryNamespaceSlug ? `@${viewer.primaryNamespaceSlug}` : "Account";
  const isHomeActive = currentView === "home";
  const isExploreActive = currentView === "explore";
  const isRepoView =
    currentView === "overview" ||
    currentView === "tree" ||
    currentView === "blob" ||
    currentView === "commit" ||
    currentView === "commits" ||
    currentView === "admin";
  const isRepositoriesUnderline = (Boolean(viewer) && isHomeActive) || isRepoView;
  const isNamespacesUnderline = currentView === "namespaces" || currentView === "owner";
  const isExploreUnderline = isExploreActive || (!viewer && isHomeActive);
  const isSignInActive = currentView === "auth-signin";

  return (
    <header className="sticky top-0 z-30 h-12 bg-canvas/95 backdrop-blur border-b border-border shrink-0">
      <div className="max-w-[1160px] h-full mx-auto px-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2 text-fg no-underline hover:text-fg">
            {resolvedBranding.logoUrl ? (
              <img
                src={resolvedBranding.logoUrl}
                alt={resolvedBranding.shortName}
                className="h-5 w-auto max-w-[120px] shrink-0 rounded-sm object-contain"
              />
            ) : (
              <svg
                className="w-4 h-4 text-fg shrink-0"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6.25 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM8.5 7.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm-4.25 4.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                <path d="M4.25 4.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 1.5 0Zm7 1.75v2.75a.75.75 0 0 1-1.5 0V6.5a1 1 0 0 0-1-1H6.5a.75.75 0 0 1 0-1.5h2.25a2.5 2.5 0 0 1 2.5 2.5Z" />
              </svg>
            )}
            <span className="font-semibold text-[14px] tracking-tight">
              {resolvedBranding.shortName}
            </span>
            <span className="hidden sm:inline text-border">/</span>
            <span className="hidden sm:inline text-[12px] text-fgMuted">{hostLabel}</span>
            <span className="sr-only">{resolvedBranding.siteName}</span>
          </a>

          <nav
            className="hidden md:flex items-center gap-5 h-12 text-[13px]"
            aria-label="Primary navigation"
          >
            <a
              href="/explore"
              aria-current={isExploreUnderline ? "page" : undefined}
              className={
                isExploreUnderline
                  ? "h-full inline-flex items-center text-fg font-medium border-b-2 border-fg no-underline"
                  : "h-full inline-flex items-center text-fgMuted hover:text-fg transition-colors no-underline"
              }
            >
              Explore
            </a>
            <a
              href={viewer ? "/" : "/#repositories"}
              aria-current={isRepositoriesUnderline ? "page" : undefined}
              className={
                isRepositoriesUnderline
                  ? "h-full inline-flex items-center text-fg font-medium border-b-2 border-fg no-underline"
                  : "h-full inline-flex items-center text-fgMuted hover:text-fg transition-colors no-underline"
              }
            >
              Repositories
            </a>
            <a
              href="/namespaces"
              aria-current={isNamespacesUnderline ? "page" : undefined}
              className={
                isNamespacesUnderline
                  ? "h-full inline-flex items-center text-fg font-medium border-b-2 border-fg no-underline"
                  : "h-full inline-flex items-center text-fgMuted hover:text-fg transition-colors no-underline"
              }
            >
              Namespaces
            </a>
            {resolvedBranding.docsUrl ? (
              <a
                href={resolvedBranding.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="h-full inline-flex items-center text-fgMuted hover:text-fg transition-colors no-underline"
              >
                Docs
              </a>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {viewer ? (
            <>
              <IslandHost
                name="header-menus"
                props={{
                  handle,
                  namespaceSlug: viewer.primaryNamespaceSlug,
                  displayName: viewer.displayName,
                  role: viewer.role,
                }}
              >
                <HeaderMenusIsland
                  handle={handle}
                  namespaceSlug={viewer.primaryNamespaceSlug}
                  displayName={viewer.displayName}
                  role={viewer.role}
                />
              </IslandHost>
              <IslandHost name="theme-toggle" props={{}}>
                <ThemeToggleIsland />
              </IslandHost>
            </>
          ) : (
            <>
              <IslandHost name="theme-toggle" props={{}}>
                <ThemeToggleIsland />
              </IslandHost>
              <a
                href="/auth"
                aria-current={isSignInActive ? "page" : undefined}
                className={
                  isSignInActive
                    ? "text-[12px] font-medium text-fg no-underline"
                    : "text-[12px] text-fgMuted hover:text-fg transition-colors no-underline"
                }
              >
                Sign in
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
