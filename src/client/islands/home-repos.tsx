/// <reference lib="dom" />

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  FolderGit2,
  GitCommitHorizontal,
  Globe,
  KeyRound,
  Lock,
  Plus,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";

import {
  buildGitCloneUrl,
  canAccessAdminPanel,
  canWriteRepositories,
  type DirectoryRole,
} from "@/shared/admin/panel";
import { formatRelativeTime } from "@/shared/web";
import { hydrateIsland } from "@/client/hydrate";

export type HomeRepositoryItem = {
  id: string;
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  updatedAt: number;
};

export type HomeReposIslandProps = {
  signedIn?: boolean;
  exploreOnly?: boolean;
  origin: string;
  primaryNamespaceSlug?: string;
  displayName?: string;
  viewerRole?: DirectoryRole;
  namespaces?: Array<{ id: string; slug: string }>;
  repositories: HomeRepositoryItem[];
  publicRepositories?: HomeRepositoryItem[];
};

type CreateRepoResponse =
  | {
      ok: true;
      id: string;
      namespaceSlug: string;
      slug: string;
      visibility: "public" | "private";
      updatedAt: number;
    }
  | { ok: false; reason: string };

export function HomeReposIsland({
  signedIn = false,
  exploreOnly = false,
  origin,
  primaryNamespaceSlug,
  displayName,
  viewerRole = "member",
  namespaces = [],
  repositories: initialRepos,
  publicRepositories = [],
}: HomeReposIslandProps) {
  const isAdmin = signedIn && canAccessAdminPanel(viewerRole);
  const canWrite = signedIn && canWriteRepositories(viewerRole);

  const [repositories, setRepositories] = useState<HomeRepositoryItem[]>(initialRepos);
  const [activeFeed, setActiveFeed] = useState<"mine" | "public">(
    !signedIn || exploreOnly ? "public" : "mine"
  );
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("public");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const sourceList = activeFeed === "public" ? publicRepositories : repositories;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceList.filter((repo) => {
      if (activeFeed === "mine" && visibilityFilter !== "all" && repo.visibility !== visibilityFilter) {
        return false;
      }
      if (!q) return true;
      return `${repo.namespaceSlug}/${repo.slug}`.toLowerCase().includes(q);
    });
  }, [sourceList, activeFeed, query, visibilityFilter]);

  async function handleCopyClone(repo: HomeRepositoryItem) {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : origin;
    const url = buildGitCloneUrl(baseOrigin, repo.namespaceSlug, repo.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(repo.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === repo.id ? null : current));
      }, 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts; ignore silently.
    }
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primaryNamespaceSlug || !newSlug.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/auth/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug: primaryNamespaceSlug,
          slug: newSlug.trim().toLowerCase(),
          visibility: newVisibility,
        }),
      });
      const body = (await response.json().catch(() => null)) as CreateRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setCreateError(
          reason === "slug-taken"
            ? "A repository with that slug already exists in this namespace."
            : reason === "invalid-slug"
              ? "Use lowercase letters, digits, and internal dashes (1–40 chars)."
              : `Could not create repository (${reason}).`
        );
        return;
      }
      setRepositories((prev) =>
        [
          ...prev,
          {
            id: body.id,
            slug: body.slug,
            namespaceSlug: body.namespaceSlug,
            visibility: body.visibility,
            updatedAt: body.updatedAt,
          },
        ].sort((a, b) =>
          `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`)
        )
      );
      setActiveFeed("mine");
      setNewSlug("");
      setShowCreate(false);
    } catch (error) {
      setCreateError(String(error));
    } finally {
      setCreating(false);
    }
  }

  const repoListPanel = (
    <div className="space-y-3">
      {/* Toolbar: Feed switcher (signed in) + Search + Visibility filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {signedIn && !exploreOnly ? (
            <div
              className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
              role="tablist"
              aria-label="Repository scope"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeFeed === "mine"}
                onClick={() => setActiveFeed("mine")}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFeed === "mine"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                My Repositories{" "}
                <span className="ml-1 font-mono text-[11px] tabular-nums opacity-75">
                  {repositories.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeFeed === "public"}
                onClick={() => setActiveFeed("public")}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFeed === "public"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                Public{" "}
                <span className="ml-1 font-mono text-[11px] tabular-nums opacity-75">
                  {publicRepositories.length}
                </span>
              </button>
            </div>
          ) : null}

          <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-none">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                activeFeed === "public" ? "Search public repositories..." : "Filter repositories..."
              }
              aria-label="Filter repositories"
              className="h-8 w-full rounded-md border border-zinc-200 bg-white pr-2.5 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {signedIn && activeFeed === "mine" ? (
            <div
              className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
              role="group"
              aria-label="Filter by visibility"
            >
              {(["all", "public", "private"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setVisibilityFilter(option)}
                  className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
                    visibilityFilter === option
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {primaryNamespaceSlug && canWrite && !exploreOnly ? (
            <button
              type="button"
              onClick={() => {
                setShowCreate((open) => !open);
                setCreateError(null);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-xs font-medium whitespace-nowrap text-white hover:bg-accent-700"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New repository</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Inline Quick Create Form */}
      {showCreate && primaryNamespaceSlug && canWrite ? (
        <form
          onSubmit={(event) => void handleCreateSubmit(event)}
          className="rounded-lg border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="home-new-repo-slug"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Repository name ({primaryNamespaceSlug}/<span className="font-mono">slug</span>)
              </label>
              <input
                id="home-new-repo-slug"
                type="text"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                placeholder="edge-worker"
                required
                className="h-8 w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="sm:w-36">
              <label
                htmlFor="home-new-repo-visibility"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Visibility
              </label>
              <select
                id="home-new-repo-visibility"
                value={newVisibility}
                onChange={(event) =>
                  setNewVisibility(event.target.value === "private" ? "private" : "public")
                }
                className="h-8 w-full rounded-md border border-zinc-300 bg-zinc-50 px-2 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={creating || !newSlug.trim()}
                className="inline-flex h-8 items-center rounded-md bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
          {createError ? (
            <p className="m-0 mt-2 text-xs text-red-600 dark:text-red-400">{createError}</p>
          ) : null}
        </form>
      ) : null}

      {/* Compact GitHub/Gitea-style Repository List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-zinc-400" aria-hidden="true" />
          <p className="m-0 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {sourceList.length === 0
              ? activeFeed === "public"
                ? "No public repositories published yet"
                : "No repositories yet"
              : "No matching repositories"}
          </p>
          <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {sourceList.length === 0
              ? signedIn
                ? "Use + in the top header or New repository above to create one."
                : "Sign in to initialize starter repositories or publish your first public repo."
              : "Adjust your search query or visibility filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
            {filtered.map((repo) => {
              const isPrivate = repo.visibility === "private";
              const isCopied = copiedId === repo.id;
              return (
                <li
                  key={repo.id}
                  className="flex flex-col justify-between gap-2.5 px-4 py-3 transition-colors hover:bg-zinc-50/70 sm:flex-row sm:items-center dark:hover:bg-zinc-800/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isPrivate ? (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Globe
                          className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
                          aria-hidden="true"
                        />
                      )}
                      <a
                        href={`/${repo.namespaceSlug}/${repo.slug}`}
                        className="truncate font-mono text-sm font-medium text-zinc-900 no-underline hover:text-accent-600 dark:text-zinc-100 dark:hover:text-accent-400"
                      >
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {repo.namespaceSlug}/
                        </span>
                        <span>{repo.slug}</span>
                      </a>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="capitalize">{repo.visibility}</span>
                      <span aria-hidden="true">·</span>
                      <span suppressHydrationWarning>
                        Updated {formatRelativeTime(repo.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyClone(repo)}
                      className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 px-2 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      title="Copy HTTPS clone URL"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          <span>Clone</span>
                        </>
                      )}
                    </button>
                    <a
                      href={`/${repo.namespaceSlug}/${repo.slug}/commits`}
                      className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 px-2 text-xs text-zinc-600 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      title="View commits"
                    >
                      <GitCommitHorizontal className="h-3 w-3" aria-hidden="true" />
                      <span className="hidden md:inline">Commits</span>
                    </a>
                    {signedIn && activeFeed === "mine" ? (
                      <a
                        href={`/${repo.namespaceSlug}/${repo.slug}/admin`}
                        className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 px-2 text-xs text-zinc-600 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        title="Repository settings"
                      >
                        <Settings className="h-3 w-3" aria-hidden="true" />
                        <span className="hidden md:inline">Settings</span>
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  // Anonymous homepage or /explore: single clean column
  if (!signedIn || exploreOnly) {
    return repoListPanel;
  }

  // Signed-in Gitea-style 2-column dashboard: main repositories feed + compact workspace panel
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
      <div className="min-w-0">{repoListPanel}</div>

      <aside className="space-y-4" aria-label="Workspace summary">
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "Workspace"}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {viewerRole}
              </span>
            </div>
            {displayName ? (
              <p className="m-0 mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {displayName}
              </p>
            ) : null}
          </div>

          <nav className="divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
            <a
              href="/user/profile"
              className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            >
              <User className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>User Profile</span>
            </a>
            <a
              href="/user/settings"
              className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            >
              <Settings className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>User Settings</span>
            </a>
            <a
              href="/user/settings/tokens"
              className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            >
              <KeyRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>Access Tokens</span>
            </a>
            {isAdmin ? (
              <>
                <a
                  href="/admin"
                  className="flex items-center gap-2 px-3.5 py-2 font-medium text-accent-700 no-underline hover:bg-zinc-50 dark:text-accent-300 dark:hover:bg-zinc-800/60"
                >
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Site Administration</span>
                </a>
                <a
                  href="/admin/settings"
                  className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Settings Control Panel</span>
                </a>
              </>
            ) : null}
          </nav>
        </div>

        {namespaces.length > 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
              Namespaces
            </div>
            <div className="flex flex-wrap gap-1.5 p-3">
              {namespaces.map((ns) => (
                <a
                  key={ns.id}
                  href={`/${ns.slug}`}
                  className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-700 no-underline hover:border-accent-500/40 hover:text-accent-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:text-accent-400"
                >
                  @{ns.slug}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function initHomeReposIsland() {
  hydrateIsland<HomeReposIslandProps>("home-repos", HomeReposIsland);
}
