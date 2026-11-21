/// <reference lib="dom" />

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderGit2, KeyRound, LayoutGrid, Users } from "lucide-react";

import {
  computeAdminMetrics,
  type AdminNamespaceEntry,
  type AdminRepositoryEntry,
  type AdminTokenEntry,
} from "@/shared/admin/panel";
import { AdminSubNav } from "@/client/components/AdminSubNav";
import { hydrateIsland } from "@/client/hydrate";
import { RepositoriesSection } from "./RepositoriesSection";
import { TokensSection } from "./TokensSection";
import type { SystemAdminIslandProps, SystemAdminTab } from "./types";

const TABS: ReadonlyArray<{
  key: SystemAdminTab;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { key: "all", label: "All sections", icon: LayoutGrid },
  { key: "tokens", label: "Access Tokens", icon: KeyRound },
  { key: "repositories", label: "Repositories", icon: FolderGit2 },
];

function tabFromHash(hash: string): SystemAdminTab | null {
  switch (hash.replace(/^#/, "")) {
    case "tokens":
      return "tokens";
    case "repositories":
      return "repositories";
    default:
      return null;
  }
}

export function SystemAdminIsland({
  origin,
  primaryNamespaceSlug,
  namespaces: initialNamespaces,
  repositories: initialRepositories,
  tokens: initialTokens,
}: SystemAdminIslandProps) {
  const [activeTab, setActiveTab] = useState<SystemAdminTab>("all");
  const [namespaces, setNamespaces] = useState<AdminNamespaceEntry[]>(initialNamespaces);
  const [repositories, setRepositories] = useState<AdminRepositoryEntry[]>(initialRepositories);
  const [tokens, setTokens] = useState<AdminTokenEntry[]>(initialTokens);

  useEffect(() => {
    const syncFromHash = () => {
      const target = tabFromHash(window.location.hash);
      if (target) setActiveTab(target);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const metrics = useMemo(
    () => computeAdminMetrics(repositories, namespaces, tokens),
    [repositories, namespaces, tokens]
  );

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-widest text-accent-600 dark:text-accent-400">
            Administration
          </p>
          <h1 className="m-0 mt-0.5 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Admin Panel
          </h1>
        </div>
        <a
          href="/admin/users"
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Users className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" aria-hidden="true" />
          <span>Manage Users</span>
          <ArrowRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        </a>
      </div>

      {/* Admin sub-navigation */}
      <AdminSubNav active="overview" userCount={metrics.totalNamespaces} />

      {/* Compact Overview Strip */}
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        aria-label="Workspace metrics overview"
      >
        <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <span>Total Repositories</span>
            <FolderGit2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {metrics.totalRepositories}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {metrics.publicRepositories} pub · {metrics.privateRepositories} priv
            </span>
          </div>
        </div>

        <a
          href="/admin/users"
          className="group block rounded-lg border border-zinc-200 bg-white px-3.5 py-3 no-underline transition-colors hover:border-accent-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-accent-500/40"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <span>Active Users / Namespaces</span>
            <Users
              className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-accent-600 dark:group-hover:text-accent-400"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {metrics.activeNamespaces}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-accent-600 dark:text-accent-400">
              <span>{metrics.totalNamespaces} total</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </div>
        </a>

        <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <span>Personal Access Tokens</span>
            <KeyRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {metrics.activeTokens}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {metrics.totalTokens} total
            </span>
          </div>
        </div>
      </div>

      {/* Section filters */}
      <div
        role="tablist"
        aria-label="Admin overview sections"
        className="flex flex-wrap items-center gap-1"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActiveTab(tab.key);
                if (typeof window !== "undefined") {
                  const nextHash = tab.key === "all" ? "" : `#${tab.key}`;
                  window.history.replaceState(null, "", `/admin${nextHash}`);
                }
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                selected
                  ? "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                  : "border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {activeTab === "all" || activeTab === "tokens" ? (
          <TokensSection
            namespaces={namespaces}
            primaryNamespaceSlug={primaryNamespaceSlug}
            tokens={tokens}
            onCreated={handleTokenCreated}
            onRevoked={handleTokenRevoked}
          />
        ) : null}

        {activeTab === "all" || activeTab === "repositories" ? (
          <RepositoriesSection
            origin={origin}
            primaryNamespaceSlug={primaryNamespaceSlug}
            namespaces={namespaces}
            repositories={repositories}
            onCreated={handleRepoCreated}
            onVisibilityChanged={handleRepoVisibilityChanged}
            onDeleted={handleRepoDeleted}
          />
        ) : null}
      </div>
    </div>
  );
}

export function initSystemAdminIsland() {
  hydrateIsland<SystemAdminIslandProps>("system-admin", SystemAdminIsland);
}
