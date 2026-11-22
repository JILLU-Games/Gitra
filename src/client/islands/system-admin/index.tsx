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

  function handleRepoVisibilityChanged(repoId: string, visibility: "public" | "private") {
    setRepositories((prev) =>
      prev.map((repo) => (repo.id === repoId ? { ...repo, visibility } : repo))
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

  if (activeSection === "repositories") {
    return (
      <div className="space-y-4">
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-3.5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
          <div>
            <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Repositories
            </h1>
            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Create repositories, toggle public or private visibility, copy clone URLs, or remove
              repositories.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            <span>{metrics.totalRepositories} total</span>
            <span>·</span>
            <span>{metrics.publicRepositories} public</span>
            <span>·</span>
            <span>{metrics.privateRepositories} private</span>
          </div>
        </header>

        <RepositoriesSection
          origin={origin}
          primaryNamespaceSlug={primaryNamespaceSlug}
          namespaces={namespaces}
          repositories={repositories}
          onCreated={handleRepoCreated}
          onVisibilityChanged={handleRepoVisibilityChanged}
          onDeleted={handleRepoDeleted}
        />
      </div>
    );
  }

  if (activeSection === "tokens") {
    return (
      <div className="space-y-4">
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-3.5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
          <div>
            <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Access Tokens
            </h1>
            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Issue and revoke Personal Access Tokens for Git Smart HTTP clone, pull, and push.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
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
    <div className="space-y-5">
      {/* Compact Header */}
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-3.5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
        <div>
          <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Control Panel
          </h1>
          <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            System overview across users, repositories, personal access tokens, and security
            configuration.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="/admin/users"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Users className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            <span>Manage Users</span>
          </a>
          <a
            href="/admin/repositories"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-2.5 text-xs font-medium text-white no-underline transition-colors hover:bg-accent-700"
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
          className="group block rounded-lg border border-zinc-200 bg-white px-3.5 py-3 no-underline transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Total Repositories</span>
            <FolderGit2
              className="h-3.5 w-3.5 text-zinc-400 group-hover:text-accent-600 dark:group-hover:text-accent-400"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {metrics.totalRepositories}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {metrics.publicRepositories} pub · {metrics.privateRepositories} priv
            </span>
          </div>
        </a>

        <a
          href="/admin/users"
          className="group block rounded-lg border border-zinc-200 bg-white px-3.5 py-3 no-underline transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Active Users / Namespaces</span>
            <Users
              className="h-3.5 w-3.5 text-zinc-400 group-hover:text-accent-600 dark:group-hover:text-accent-400"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {metrics.activeNamespaces}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {metrics.totalNamespaces} total
            </span>
          </div>
        </a>

        <a
          href="/admin/tokens"
          className="group block rounded-lg border border-zinc-200 bg-white px-3.5 py-3 no-underline transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Personal Access Tokens</span>
            <KeyRound
              className="h-3.5 w-3.5 text-zinc-400 group-hover:text-accent-600 dark:group-hover:text-accent-400"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {metrics.activeTokens}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {metrics.totalTokens} total
            </span>
          </div>
        </a>
      </div>

      {/* Dashboard Two-Column Summary */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* Repositories Snapshot */}
        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <h2 className="m-0 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Repositories
            </h2>
            <a
              href="/admin/repositories"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 no-underline hover:underline dark:text-accent-400"
            >
              <span>Manage all</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>

          {recentRepos.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No repositories yet. Create one in{" "}
              <a
                href="/admin/repositories"
                className="text-accent-600 underline dark:text-accent-400"
              >
                Repositories
              </a>
              .
            </div>
          ) : (
            <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
              {recentRepos.map((repo) => (
                <li
                  key={repo.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {repo.visibility === "private" ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                    )}
                    <a
                      href={`/${repo.namespaceSlug}/${repo.slug}`}
                      className="truncate font-mono font-medium text-zinc-900 no-underline hover:text-accent-600 hover:underline dark:text-zinc-100 dark:hover:text-accent-400"
                    >
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {repo.namespaceSlug}/
                      </span>
                      {repo.slug}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="hidden items-center gap-1 sm:inline-flex">
                      <GitBranch className="h-3 w-3" aria-hidden="true" />
                      {repo.defaultBranch}
                    </span>
                    <span
                      className={
                        repo.visibility === "private"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-500 dark:text-zinc-400"
                      }
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
          <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800">
              <h2 className="m-0 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                User Directory
              </h2>
              <a
                href="/admin/users"
                className="text-xs font-medium text-accent-600 no-underline hover:underline dark:text-accent-400"
              >
                Open
              </a>
            </div>
            <dl className="m-0 divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Admins</dt>
                <dd className="m-0 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {roleCounts.admins}
                </dd>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Members</dt>
                <dd className="m-0 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {roleCounts.members}
                </dd>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Viewers</dt>
                <dd className="m-0 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {roleCounts.viewers}
                </dd>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <dt className="text-zinc-500 dark:text-zinc-400">Auth Mode</dt>
                <dd className="m-0 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {authMode === "configured" ? "Configured" : "Demo / Preview"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Control Shortcuts
            </div>
            <div className="space-y-0.5 text-xs">
              <a
                href="/admin/tokens"
                className="flex h-8 items-center justify-between rounded-md px-2 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Issue Access Token</span>
                </span>
                <ArrowRight className="h-3 w-3 text-zinc-400" aria-hidden="true" />
              </a>
              <a
                href="/admin/settings"
                className="flex h-8 items-center justify-between rounded-md px-2 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Instance Settings</span>
                </span>
                <ArrowRight className="h-3 w-3 text-zinc-400" aria-hidden="true" />
              </a>
              <a
                href="/admin/security"
                className="flex h-8 items-center justify-between rounded-md px-2 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Security &amp; Policies</span>
                </span>
                <ArrowRight className="h-3 w-3 text-zinc-400" aria-hidden="true" />
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
