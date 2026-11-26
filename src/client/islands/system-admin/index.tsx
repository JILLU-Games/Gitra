/// <reference lib="dom" />

import { useMemo, useState } from "react";
import {
  ArrowRight,
  FolderGit2,
  GitBranch,
  Globe,
  KeyRound,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import {
  computeAdminMetrics,
  computeUserRoleCounts,
  type AdminNamespaceEntry,
  type AdminRepositoryEntry,
  type AdminTokenEntry,
} from "@/shared/admin/panel";
import { hydrateIsland } from "@/client/hydrate";
import { RepositoriesSection } from "./RepositoriesSection";
import { TokensSection } from "./TokensSection";
import type { SystemAdminIslandProps } from "./types";

export function SystemAdminIsland({
  activeSection = "overview",
  authMode = "demo",
  origin,
  primaryNamespaceSlug,
  namespaces: initialNamespaces,
  repositories: initialRepositories,
  tokens: initialTokens,
}: SystemAdminIslandProps) {
  const [namespaces, setNamespaces] = useState<AdminNamespaceEntry[]>(initialNamespaces);
  const [repositories, setRepositories] = useState<AdminRepositoryEntry[]>(initialRepositories);
  const [tokens, setTokens] = useState<AdminTokenEntry[]>(initialTokens);

  const metrics = useMemo(
    () => computeAdminMetrics(repositories, namespaces, tokens),
    [repositories, namespaces, tokens]
  );
  const roleCounts = useMemo(() => computeUserRoleCounts(namespaces), [namespaces]);

  function handleTokenCreated(token: AdminTokenEntry) {
    setTokens((prev) => [token, ...prev]);
  }

  function handleTokenRevoked(tokenId: string, revokedAt: number) {
    setTokens((prev) =>
      prev.map((token) => (token.id === tokenId ? { ...token, revokedAt } : token))
    );
  }

  function handleRepoCreated(repo: AdminRepositoryEntry) {
    setRepositories((prev) =>
      [...prev, repo].sort((a, b) =>
        `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`)
      )
    );
    setNamespaces((prev) =>
      prev.map((ns) =>
        ns.slug === repo.namespaceSlug ? { ...ns, repoCount: ns.repoCount + 1 } : ns
      )
    );
  }

  function handleRepoVisibilityChanged(
    repoId: string,
    visibility: "public" | "private",
    homePinned?: boolean
  ) {
    setRepositories((prev) =>
      prev.map((repo) =>
        repo.id === repoId
          ? {
              ...repo,
              visibility,
              homePinned:
                homePinned !== undefined
                  ? homePinned
                  : visibility === "private"
                    ? false
                    : repo.homePinned,
            }
          : repo
      )
    );
  }

  function handleRepoPinChanged(repoId: string, pinned: boolean, homePinned: boolean) {
    setRepositories((prev) =>
      prev.map((repo) => (repo.id === repoId ? { ...repo, pinned, homePinned } : repo))
    );
  }

  function handleRepoDeleted(repoId: string, namespaceId: string) {
    setRepositories((prev) => prev.filter((repo) => repo.id !== repoId));
    setNamespaces((prev) =>
      prev.map((ns) =>
        ns.id === namespaceId ? { ...ns, repoCount: Math.max(0, ns.repoCount - 1) } : ns
      )
    );
  }

  const pinnedCount = useMemo(
    () => repositories.filter((repo) => repo.pinned).length,
    [repositories]
  );
  const homePinnedCount = useMemo(
    () => repositories.filter((repo) => repo.visibility === "public" && repo.homePinned).length,
    [repositories]
  );

  if (activeSection === "repositories") {
    return (
      <div className="space-y-4">
        <header className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">Repositories</h1>
            <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
              Manage visibility, profile pins, public homepage featuring, clone URLs, or repository
              removal.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 whitespace-nowrap font-mono text-[12px] text-fgMuted tabular-nums">
            <span>{metrics.totalRepositories} total</span>
            <span>·</span>
            <span>{metrics.publicRepositories} public</span>
            <span>·</span>
            <span>{metrics.privateRepositories} private</span>
            <span>·</span>
            <span>{pinnedCount} pinned</span>
            <span>·</span>
            <span>{homePinnedCount} homepage</span>
          </div>
        </header>

        <RepositoriesSection
          origin={origin}
          primaryNamespaceSlug={primaryNamespaceSlug}
          namespaces={namespaces}
          repositories={repositories}
          onCreated={handleRepoCreated}
          onVisibilityChanged={handleRepoVisibilityChanged}
          onPinChanged={handleRepoPinChanged}
          onDeleted={handleRepoDeleted}
        />
      </div>
    );
  }

  if (activeSection === "tokens") {
    return (
      <div className="space-y-4">
        <header className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">Access Tokens</h1>
            <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
              Issue and revoke Personal Access Tokens for Git Smart HTTP clone, pull, and push.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono text-[12px] text-fgMuted tabular-nums">
            <span>{metrics.activeTokens} active</span>
            <span>·</span>
            <span>{metrics.totalTokens} total</span>
          </div>
        </header>

        <TokensSection
          namespaces={namespaces}
          primaryNamespaceSlug={primaryNamespaceSlug}
          tokens={tokens}
          onCreated={handleTokenCreated}
          onRevoked={handleTokenRevoked}
        />
      </div>
    );
  }

  const recentRepos = repositories.slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <header className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">Control Panel</h1>
          <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
            System overview across users, repositories, personal access tokens, and security
            configuration.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="/admin/users"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            <Users className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>Manage Users</span>
          </a>
          <a
            href="/admin/repositories"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas no-underline transition-colors hover:bg-fgHover"
          >
            <FolderGit2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Repositories</span>
          </a>
        </div>
      </header>

      {/* Compact KPI Strip */}
      <div
        className="grid grid-cols-1 gap-3 md:grid-cols-3"
        aria-label="Workspace metrics overview"
      >
        <a
          href="/admin/repositories"
          className="group block rounded-md border border-border bg-surface px-3.5 py-3 no-underline transition-colors hover:bg-surfaceHover"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-fgMuted">
            <span>Total Repositories</span>
            <FolderGit2
              className="h-3.5 w-3.5 text-fgMuted group-hover:text-fg"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[20px] font-semibold tabular-nums text-fg">
              {metrics.totalRepositories}
            </span>
            <span className="font-mono text-[11px] text-fgMuted">
              {metrics.publicRepositories} pub · {metrics.privateRepositories} priv
            </span>
          </div>
        </a>

        <a
          href="/admin/users"
          className="group block rounded-md border border-border bg-surface px-3.5 py-3 no-underline transition-colors hover:bg-surfaceHover"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-fgMuted">
            <span>Active Users / Namespaces</span>
            <Users className="h-3.5 w-3.5 text-fgMuted group-hover:text-fg" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[20px] font-semibold tabular-nums text-fg">
              {metrics.activeNamespaces}
            </span>
            <span className="font-mono text-[11px] text-fgMuted">
              {metrics.totalNamespaces} total
            </span>
          </div>
        </a>

        <a
          href="/admin/tokens"
          className="group block rounded-md border border-border bg-surface px-3.5 py-3 no-underline transition-colors hover:bg-surfaceHover"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-fgMuted">
            <span>Personal Access Tokens</span>
            <KeyRound className="h-3.5 w-3.5 text-fgMuted group-hover:text-fg" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[20px] font-semibold tabular-nums text-fg">
              {metrics.activeTokens}
            </span>
            <span className="font-mono text-[11px] text-fgMuted">{metrics.totalTokens} total</span>
          </div>
        </a>
      </div>

      {/* Dashboard Two-Column Summary */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* Repositories Snapshot */}
        <section className="overflow-hidden rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="m-0 text-[13px] font-semibold text-fg">Repositories</h2>
            <a
              href="/admin/repositories"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent no-underline hover:underline"
            >
              <span>Manage all</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>

          {recentRepos.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-fgMuted">
              No repositories yet. Create one in{" "}
              <a href="/admin/repositories" className="text-accent underline">
                Repositories
              </a>
              .
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-borderSubtle p-0">
              {recentRepos.map((repo) => (
                <li
                  key={repo.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] transition-colors hover:bg-surfaceHover"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {repo.visibility === "private" ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
                    )}
                    <a
                      href={`/${repo.namespaceSlug}/${repo.slug}`}
                      className="truncate font-mono font-medium text-fg no-underline hover:text-accent hover:underline"
                    >
                      <span className="text-fgMuted">{repo.namespaceSlug}/</span>
                      {repo.slug}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-fgMuted">
                    {repo.homePinned ? <span className="text-fg">homepage</span> : null}
                    {repo.pinned ? <span>pinned</span> : null}
                    <span className="hidden items-center gap-1 sm:inline-flex">
                      <GitBranch className="h-3 w-3" aria-hidden="true" />
                      {repo.defaultBranch}
                    </span>
                    <span
                      className={repo.visibility === "private" ? "text-amber-400" : "text-fgMuted"}
                    >
                      {repo.visibility}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Directory & System Status Card */}
        <div className="space-y-4">
          <section className="rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
              <h2 className="m-0 text-[13px] font-semibold text-fg">User Directory</h2>
              <a
                href="/admin/users"
                className="text-[12px] font-medium text-accent no-underline hover:underline"
              >
                Open
              </a>
            </div>
            <dl className="m-0 divide-y divide-borderSubtle text-[12px]">
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-fgMuted">Admins</dt>
                <dd className="m-0 font-mono tabular-nums text-fg">{roleCounts.admins}</dd>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-fgMuted">Members</dt>
                <dd className="m-0 font-mono tabular-nums text-fg">{roleCounts.members}</dd>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-fgMuted">Viewers</dt>
                <dd className="m-0 font-mono tabular-nums text-fg">{roleCounts.viewers}</dd>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-fgMuted">Auth Mode</dt>
                <dd className="m-0 font-mono text-[11px] text-fgBody">
                  {authMode === "configured" ? "Configured" : "Demo / Preview"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-border bg-surface p-2">
            <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fgMuted">
              Control Shortcuts
            </div>
            <div className="space-y-0.5 text-[12px]">
              <a
                href="/admin/tokens"
                className="flex h-8 items-center justify-between rounded-md px-2 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Issue Access Token</span>
                </span>
                <ArrowRight className="h-3 w-3 text-fgMuted" aria-hidden="true" />
              </a>
              <a
                href="/admin/settings"
                className="flex h-8 items-center justify-between rounded-md px-2 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Instance Settings</span>
                </span>
                <ArrowRight className="h-3 w-3 text-fgMuted" aria-hidden="true" />
              </a>
              <a
                href="/admin/security"
                className="flex h-8 items-center justify-between rounded-md px-2 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Security &amp; Policies</span>
                </span>
                <ArrowRight className="h-3 w-3 text-fgMuted" aria-hidden="true" />
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function initSystemAdminIsland() {
  hydrateIsland<SystemAdminIslandProps>("system-admin", SystemAdminIsland);
}
