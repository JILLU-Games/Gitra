/// <reference lib="dom" />

import { useMemo, useState } from "react";
import {
  BookOpen,
  FolderGit2,
  Globe,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import { sanitizeMarkdownHtml } from "@/client/components/markdownHtmlSanitizer";
import { hydrateIsland } from "@/client/hydrate";
import { PROFILE_README_PATH, PROFILE_REPO_SLUG } from "@/shared/slugs";
import { formatRelativeTime } from "@/shared/web";

export type OwnerProfileActionIslandProps = {
  owner: string;
  canManageProfile: boolean;
  hasProfileRepo: boolean;
};

type CreateProfileRepoResponse =
  { ok: true; namespaceSlug: string; slug: string } | { ok: false; reason?: string };

export function OwnerProfileActionIsland({
  owner,
  canManageProfile,
  hasProfileRepo,
}: OwnerProfileActionIslandProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  if (!canManageProfile) return null;

  if (hasProfileRepo) {
    return (
      <a
        href={`/${encodeURIComponent(owner)}/${PROFILE_REPO_SLUG}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Edit .vibtools profile</span>
      </a>
    );
  }

  async function handleQuickCreate() {
    if (creating) return;
    setCreating(true);
    setError(null);
    setSessionExpired(false);
    try {
      const response = await fetch("/auth/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug: owner,
          slug: PROFILE_REPO_SLUG,
          visibility: "public",
          initializeProfileReadme: true,
        }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        setError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as CreateProfileRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setError(`Failed (${reason ?? "error"})`);
        return;
      }
      window.location.assign(`/${encodeURIComponent(body.namespaceSlug)}/${body.slug}`);
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleQuickCreate()}
        disabled={creating}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{creating ? "Creating .vibtools…" : "Create .vibtools profile"}</span>
      </button>
      {error ? (
        <span role="alert" className="text-[11px] text-red-600 dark:text-red-400">
          {error}
          {sessionExpired ? (
            <a href="/auth" className="ml-1.5 font-medium underline">
              Sign in
            </a>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

export type OwnerRepoSummary = {
  id?: string;
  slug: string;
  visibility: "public" | "private";
  description?: string;
  pinned?: boolean;
  updatedAt?: number;
};

export type OwnerReposIslandProps = {
  owner: string;
  canManageProfile: boolean;
  hasProfileRepo?: boolean;
  profileRepoVisibility?: "public" | "private";
  profileReadmeHtml?: string;
  profileReadmePath?: string;
  profileRef?: string;
  repos: OwnerRepoSummary[];
};

type PinToggleResponse = { ok: true; pinned: boolean } | { ok: false; reason?: string };

export function OwnerReposIsland({
  owner,
  canManageProfile,
  hasProfileRepo = false,
  profileRepoVisibility,
  profileReadmeHtml = "",
  profileReadmePath = PROFILE_README_PATH,
  profileRef = "main",
  repos: initialRepos,
}: OwnerReposIslandProps) {
  const [repos, setRepos] = useState<OwnerRepoSummary[]>(initialRepos);
  const [tab, setTab] = useState<"overview" | "repositories">("overview");
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [pinPendingId, setPinPendingId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSessionExpired, setPinSessionExpired] = useState(false);

  const sanitizedReadmeHtml = useMemo(
    () => (profileReadmeHtml ? sanitizeMarkdownHtml(profileReadmeHtml) : ""),
    [profileReadmeHtml]
  );
  const editProfileUrl = `/${encodeURIComponent(owner)}/${PROFILE_REPO_SLUG}`;

  const pinnedRepos = useMemo(() => repos.filter((repo) => repo.pinned).slice(0, 6), [repos]);

  const overviewShowcaseRepos = useMemo(() => {
    if (pinnedRepos.length > 0) return pinnedRepos;
    const regularRepos = repos.filter((repo) => repo.slug !== PROFILE_REPO_SLUG);
    return (regularRepos.length > 0 ? regularRepos : repos).slice(0, 6);
  }, [pinnedRepos, repos]);

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter((repo) => {
      if (visibilityFilter !== "all" && repo.visibility !== visibilityFilter) return false;
      if (!q) return true;
      return (
        repo.slug.toLowerCase().includes(q) || (repo.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [repos, query, visibilityFilter]);

  async function togglePin(repo: OwnerRepoSummary) {
    if (!canManageProfile || !repo.id || pinPendingId) return;
    setPinPendingId(repo.id);
    setPinError(null);
    setPinSessionExpired(false);
    const nextPinned = !repo.pinned;
    try {
      const response = await fetch(`/auth/api/repositories/${encodeURIComponent(repo.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned }),
      });
      if (response.status === 401) {
        setPinSessionExpired(true);
        setPinError("Session expired — please sign in again.");
        return;
      }
      const body = (await response.json().catch(() => null)) as PinToggleResponse | null;
      if (!response.ok || !body || !body.ok) {
        setPinError("Could not update pinned repositories.");
        return;
      }
      setRepos((prev) =>
        prev.map((item) => (item.id === repo.id ? { ...item, pinned: body.pinned } : item))
      );
    } catch {
      setPinError("Network error while updating pinned state.");
    } finally {
      setPinPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* GitHub/Gitea Profile Underline Tabs */}
      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          onClick={() => setTab("overview")}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
            tab === "overview"
              ? "border-accent-500 font-medium text-zinc-950 dark:text-zinc-50"
              : "border-transparent font-normal text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
          }`}
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Overview</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "repositories"}
          onClick={() => setTab("repositories")}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
            tab === "repositories"
              ? "border-accent-500 font-medium text-zinc-950 dark:text-zinc-50"
              : "border-transparent font-normal text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
          }`}
        >
          <FolderGit2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Repositories</span>
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 tabular-nums dark:bg-zinc-800 dark:text-zinc-300">
            {repos.length}
          </span>
        </button>
      </div>

      {pinError ? (
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <span>{pinError}</span>
          {pinSessionExpired ? (
            <a href="/auth" className="ml-1.5 font-medium underline">
              Sign in
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Overview Tab: .vibtools/profile/README.md + Pinned / Popular Repositories */}
      {tab === "overview" ? (
        <div className="space-y-4">
          {sanitizedReadmeHtml ? (
            <section
              aria-label="Organization profile README"
              className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3.5 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex min-w-0 items-center gap-1.5 font-mono text-zinc-600 dark:text-zinc-300">
                  <BookOpen
                    className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                    aria-hidden="true"
                  />
                  <a
                    href={editProfileUrl}
                    className="truncate text-zinc-700 no-underline hover:text-accent-600 dark:text-zinc-200 dark:hover:text-accent-400"
                  >
                    {owner}/{PROFILE_REPO_SLUG}
                  </a>
                  <span className="text-zinc-400" aria-hidden="true">
                    /
                  </span>
                  <a
                    href={`/${encodeURIComponent(owner)}/${PROFILE_REPO_SLUG}/blob?ref=${encodeURIComponent(profileRef)}&path=${encodeURIComponent(profileReadmePath)}`}
                    className="truncate text-zinc-500 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {profileReadmePath}
                  </a>
                  {profileRepoVisibility === "private" ? (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                      private
                    </span>
                  ) : null}
                </div>

                {canManageProfile ? (
                  <a
                    href={editProfileUrl}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 no-underline hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    <span>Edit README</span>
                  </a>
                ) : null}
              </div>
              <div className="markdown-compact px-5 py-4">
                <div
                  className="markdown-content"
                  dangerouslySetInnerHTML={{ __html: sanitizedReadmeHtml }}
                />
              </div>
            </section>
          ) : canManageProfile ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50/70 px-3.5 py-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
              <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                <Sparkles
                  className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                  aria-hidden="true"
                />
                {hasProfileRepo ? (
                  <span>
                    Your <code className="font-mono">{PROFILE_REPO_SLUG}</code> repository exists.
                    Add <code className="font-mono">{PROFILE_README_PATH}</code> to display a custom
                    profile card here.
                  </span>
                ) : (
                  <span>
                    Create a <code className="font-mono">{PROFILE_REPO_SLUG}</code> repository with{" "}
                    <code className="font-mono">{PROFILE_README_PATH}</code> to design a custom
                    profile banner here.
                  </span>
                )}
              </div>
              {hasProfileRepo ? (
                <a
                  href={editProfileUrl}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  <span>Add {PROFILE_README_PATH}</span>
                </a>
              ) : null}
            </div>
          ) : null}

          {overviewShowcaseRepos.length > 0 ? (
            <section
              aria-label={pinnedRepos.length > 0 ? "Pinned repositories" : "Popular repositories"}
              className="space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {pinnedRepos.length > 0 ? (
                    <Pin className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
                  ) : (
                    <FolderGit2 className="h-3.5 w-3.5 text-accent-500" aria-hidden="true" />
                  )}
                  <span>{pinnedRepos.length > 0 ? "Pinned" : "Popular repositories"}</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setTab("repositories")}
                  className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400"
                >
                  View all {repos.length} repositories
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {overviewShowcaseRepos.map((repo) => {
                  const isPrivate = repo.visibility === "private";
                  return (
                    <div
                      key={repo.slug}
                      className="flex flex-col justify-between gap-2 rounded-md border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo.slug)}`}
                            className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-accent-600 no-underline hover:underline dark:text-accent-400"
                          >
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
                            <span className="truncate">{repo.slug}</span>
                          </a>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium capitalize text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                              {repo.visibility}
                            </span>
                            {canManageProfile && repo.id ? (
                              <button
                                type="button"
                                onClick={() => void togglePin(repo)}
                                disabled={pinPendingId === repo.id}
                                aria-label={repo.pinned ? `Unpin ${repo.slug}` : `Pin ${repo.slug}`}
                                title={repo.pinned ? "Unpin repository" : "Pin repository"}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                              >
                                {repo.pinned ? (
                                  <PinOff className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <Pin className="h-3 w-3" aria-hidden="true" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {repo.description ? (
                          <p className="m-0 mt-1.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                            {repo.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="rounded-md border border-zinc-200 bg-white px-4 py-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-zinc-400" aria-hidden="true" />
              <p className="m-0 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                No repositories yet
              </p>
              <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Create or push a repository under @{owner} to get started.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Repositories Tab: Full Filterable Directory */
        <section
          aria-label="Repositories"
          className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Repositories
            </h2>

            {repos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find a repository..."
                    aria-label="Find a repository"
                    className="h-7 w-44 rounded-md border border-zinc-200 bg-zinc-50 pr-2 pl-6.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-950">
                  {(["all", "public", "private"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setVisibilityFilter(option)}
                      className={`rounded-md px-2 py-0.5 capitalize ${
                        visibilityFilter === option
                          ? "bg-white font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {filteredRepos.length > 0 ? (
            <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
              {filteredRepos.map((repo) => {
                const isPrivate = repo.visibility === "private";
                const isProfile = repo.slug === PROFILE_REPO_SLUG;
                return (
                  <li
                    key={repo.slug}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/35"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {isPrivate ? (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                            aria-label="Private repository"
                          />
                        ) : (
                          <Globe
                            className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
                            aria-label="Public repository"
                          />
                        )}
                        <a
                          href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo.slug)}`}
                          className="truncate text-sm font-semibold text-accent-600 no-underline hover:underline dark:text-accent-400"
                        >
                          <span className="font-normal text-zinc-500 dark:text-zinc-400">
                            {owner}/
                          </span>
                          <span>{repo.slug}</span>
                        </a>
                        {isProfile ? (
                          <span className="rounded-md border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 text-[11px] font-medium text-accent-700 dark:text-accent-300">
                            profile
                          </span>
                        ) : null}
                      </div>
                      {repo.description ? (
                        <p className="m-0 mt-1 line-clamp-1 pl-5.5 text-xs text-zinc-600 dark:text-zinc-300">
                          {repo.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {canManageProfile && repo.id ? (
                        <button
                          type="button"
                          onClick={() => void togglePin(repo)}
                          disabled={pinPendingId === repo.id}
                          className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                            repo.pinned
                              ? "border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                              : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>{repo.pinned ? "Pinned" : "Pin"}</span>
                        </button>
                      ) : null}
                      <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] font-medium capitalize dark:border-zinc-700">
                        {repo.visibility}
                      </span>
                      {typeof repo.updatedAt === "number" ? (
                        <span className="hidden sm:inline" suppressHydrationWarning>
                          Updated {formatRelativeTime(repo.updatedAt)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-10 text-center">
              <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-zinc-400" aria-hidden="true" />
              <p className="m-0 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {repos.length === 0 ? "No repositories yet" : "No matching repositories"}
              </p>
              <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {repos.length === 0
                  ? `Create or push a repository under @${owner} to get started.`
                  : "Adjust your search query or visibility filter."}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function initOwnerProfileActionIsland() {
  hydrateIsland<OwnerProfileActionIslandProps>("owner-profile-action", OwnerProfileActionIsland);
  hydrateIsland<OwnerReposIslandProps>("owner-repos", OwnerReposIsland);
}
