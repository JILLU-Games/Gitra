import { GitBranch, LogIn } from "lucide-react";

import { HeaderMenusIsland } from "@/client/islands/header-menus";
import { ThemeToggleIsland } from "@/client/islands/theme-toggle";
import { IslandHost } from "@/client/server/IslandHost";
import type { Viewer } from "@/client/server/viewer";

type HeaderProps = {
  currentView?: string;
  viewer?: Viewer | null;
};

export function Header({ currentView, viewer }: HeaderProps) {
  const handle = viewer?.primaryNamespaceSlug ? `@${viewer.primaryNamespaceSlug}` : "Account";
  const isHomeActive = currentView === "home";
  const isExploreActive = currentView === "explore";

  return (
    <header className="sticky top-0 z-50 h-12 w-full shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        {/* Left Zone: Brand + concise single-line Gitea-style links */}
        <div className="flex min-w-0 items-center gap-6">
          <a
            href="/"
            className="flex shrink-0 items-center gap-2 text-sm font-semibold whitespace-nowrap text-zinc-900 no-underline hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-200"
          >
            <span className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60">
              <GitBranch
                className="h-4 w-4 text-accent-600 dark:text-accent-400"
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
            <span className="tracking-tight">git-on-cloudflare</span>
          </a>

          <nav className="hidden items-center gap-5 sm:flex" aria-label="Primary navigation">
            {viewer ? (
              <>
                <a
                  href="/"
                  aria-current={isHomeActive ? "page" : undefined}
                  className={`text-xs font-medium whitespace-nowrap no-underline transition-colors ${
                    isHomeActive
                      ? "text-zinc-950 dark:text-white"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Repositories
                </a>
                <a
                  href="/explore"
                  aria-current={isExploreActive ? "page" : undefined}
                  className={`text-xs font-medium whitespace-nowrap no-underline transition-colors ${
                    isExploreActive
                      ? "text-zinc-950 dark:text-white"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Explore
                </a>
              </>
            ) : (
              <a
                href="/explore"
                aria-current={isExploreActive || isHomeActive ? "page" : undefined}
                className={`text-xs font-medium whitespace-nowrap no-underline transition-colors ${
                  isExploreActive || isHomeActive
                    ? "text-zinc-950 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                Explore
              </a>
            )}
          </nav>
        </div>

        {/* Right Zone: Theme toggle + Sign in (logged out) OR + Create & User menu (logged in) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap no-underline transition-colors ${
                  currentView === "auth-signin"
                    ? "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                    : "border-accent-600 bg-accent-600 text-white hover:bg-accent-700"
                }`}
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign in</span>
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
