/// <reference lib="dom" />

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Building2,
  Check,
  Copy,
  ExternalLink,
  FolderGit2,
  GitCommitHorizontal,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
} from "lucide-react";

import {
  buildGitCloneUrl,
  buildNamespaceProfileHref,
  canAccessAdminPanel,
  canWriteRepositories,
  type DirectoryRole,
} from "@/shared/admin/panel";
import { PROFILE_README_PATH, PROFILE_REPO_SLUG } from "@/shared/slugs";
import { formatRelativeTime } from "@/shared/web";
import { hydrateIsland } from "@/client/hydrate";

export type PublicNamespaceItem = {
  slug: string;
  displayName: string;
  bio?: string;
  website?: string;
  publicRepoCount: number;
  projectRepoCount: number;
};

export type HomeRepositoryItem = {
  id: string;
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  description?: string;
  pinned?: boolean;
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
  publicNamespaces?: PublicNamespaceItem[];
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
      description?: string;
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
  publicNamespaces = [],
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
  const [namespaceFilter, setNamespaceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "name">("updated");
  const [showProfileRepos, setShowProfileRepos] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("public");
  const [initReadme, setInitReadme] = useState(false);
  const [initProfileReadme, setInitProfileReadme] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const isProfileSlug = newSlug.trim().toLowerCase() === PROFILE_REPO_SLUG;

  const sourceList = activeFeed === "public" ? publicRepositories : repositories;

  const hasNonProfilePublicRepos = useMemo(
    () => publicRepositories.some((repo) => repo.slug !== PROFILE_REPO_SLUG),
    [publicRepositories]
  );

  const hasProfilePublicRepos = useMemo(
    () => publicRepositories.some((repo) => repo.slug === PROFILE_REPO_SLUG),
    [publicRepositories]
  );

  const hasNonProfileInActiveNamespace = useMemo(
    () =>
      publicRepositories.some(
        (repo) =>
          repo.slug !== PROFILE_REPO_SLUG &&
          (namespaceFilter === "all" || repo.namespaceSlug === namespaceFilter)
      ),
    [publicRepositories, namespaceFilter]
  );

  const teamFilterItems = useMemo(() => {
    if (publicNamespaces.length > 0) {
      return publicNamespaces;
    }
    const map = new Map<string, PublicNamespaceItem>();
    for (const repo of publicRepositories) {
      const existing = map.get(repo.namespaceSlug);
      const isProject = repo.slug !== PROFILE_REPO_SLUG;
      if (existing) {
        existing.publicRepoCount += 1;
        if (isProject) existing.projectRepoCount += 1;
      } else {
        map.set(repo.namespaceSlug, {
          slug: repo.namespaceSlug,
          displayName: repo.namespaceSlug,
          publicRepoCount: 1,
          projectRepoCount: isProject ? 1 : 0,
        });
      }
    }
    return Array.from(map.values());
  }, [publicNamespaces, publicRepositories]);

  const featuredRepositories = useMemo(() => {
    const projectPublicRepos = publicRepositories.filter((repo) => repo.slug !== PROFILE_REPO_SLUG);
    return [...projectPublicRepos]
      .sort((a, b) => {
        const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        if (pinDiff !== 0) return pinDiff;
        const timeDiff = b.updatedAt - a.updatedAt;
        if (timeDiff !== 0) return timeDiff;
        return `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`);
      })
      .slice(0, 2);
  }, [publicRepositories]);

  const publicProjectTotalCount = useMemo(() => {
    if (!hasNonProfilePublicRepos || showProfileRepos) {
      return publicRepositories.length;
    }
    return publicRepositories.filter((repo) => repo.slug !== PROFILE_REPO_SLUG).length;
  }, [publicRepositories, hasNonProfilePublicRepos, showProfileRepos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = sourceList.filter((repo) => {
      if (
        activeFeed === "mine" &&
        visibilityFilter !== "all" &&
        repo.visibility !== visibilityFilter
      ) {
        return false;
      }
      if (activeFeed === "public") {
        if (namespaceFilter !== "all" && repo.namespaceSlug !== namespaceFilter) {
          return false;
        }
        if (
          repo.slug === PROFILE_REPO_SLUG &&
          hasNonProfileInActiveNamespace &&
          !showProfileRepos &&
          !q.includes(PROFILE_REPO_SLUG)
        ) {
          return false;
        }
      }
      if (!q) return true;
      return (
        `${repo.namespaceSlug}/${repo.slug}`.toLowerCase().includes(q) ||
        (repo.description ?? "").toLowerCase().includes(q)
      );
    });

    return [...matching].sort((a, b) => {
      if (sortBy === "name") {
        return `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`);
      }
      const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDiff !== 0) return pinDiff;
      const timeDiff = b.updatedAt - a.updatedAt;
      if (timeDiff !== 0) return timeDiff;
      return `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`);
    });
  }, [
    sourceList,
    activeFeed,
    query,
    visibilityFilter,
    namespaceFilter,
    hasNonProfileInActiveNamespace,
    showProfileRepos,
    sortBy,
  ]);

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

  function handleResetFilters() {
    setQuery("");
    setNamespaceFilter("all");
    setVisibilityFilter("all");
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primaryNamespaceSlug || !newSlug.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const normalizedSlug = newSlug.trim().toLowerCase();
      const response = await fetch("/auth/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug: primaryNamespaceSlug,
          slug: normalizedSlug,
          visibility: newVisibility,
          description: newDescription.trim(),
          initializeReadme: normalizedSlug !== PROFILE_REPO_SLUG ? initReadme : false,
          initializeProfileReadme: normalizedSlug === PROFILE_REPO_SLUG ? initProfileReadme : false,
        }),
      });
      const body = (await response.json().catch(() => null)) as CreateRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setCreateError(
          reason === "slug-taken"
            ? "A repository with that slug already exists in this namespace."
            : reason === "invalid-slug"
              ? "Use lowercase letters, digits, hyphens/dots, or .vibtools (1–40 chars)."
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
            description: body.description ?? "",
            updatedAt: body.updatedAt,
          },
        ].sort((a, b) =>
          `${a.namespaceSlug}/${a.slug}`.localeCompare(`${b.namespaceSlug}/${b.slug}`)
        )
      );
      setActiveFeed("mine");
      setNewSlug("");
      setNewDescription("");
      setInitReadme(false);
      setShowCreate(false);
    } catch (error) {
      setCreateError(String(error));
    } finally {
      setCreating(false);
    }
  }

  const showFeaturedSection =
    activeFeed === "public" &&
    !query.trim() &&
    namespaceFilter === "all" &&
    featuredRepositories.length > 0;

  const repoListPanel = (
    <div className="space-y-3.5">
      {/* Featured / Pinned Open-Source Projects Showcase Grid */}
      {showFeaturedSection ? (
        <section aria-label="Featured open-source projects" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              <Sparkles
                className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <span>Featured Open-Source Projects</span>
            </div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Flagship releases &amp; active starter kits
            </span>
          </div>

          <div
            className={`grid grid-cols-1 gap-3 ${
              featuredRepositories.length > 1 ? "md:grid-cols-2" : ""
            }`}
          >
            {featuredRepositories.map((repo) => {
              const isCopied = copiedId === repo.id;
              return (
                <div
                  key={`featured-${repo.id}`}
                  className="flex flex-col justify-between gap-3 rounded-md border border-zinc-200 bg-white p-3.5 transition-colors hover:border-accent-500/50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-accent-400/50"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 text-sm tracking-tight">
                        <FolderGit2
                          className="h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400"
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 items-center truncate">
                          <a
                            href={buildNamespaceProfileHref(repo.namespaceSlug)}
                            className="font-medium text-zinc-700 no-underline hover:text-accent-600 hover:underline dark:text-zinc-200 dark:hover:text-accent-400"
                          >
                            {repo.namespaceSlug}
                          </a>
                          <span
                            className="mx-1 text-zinc-400 dark:text-zinc-500"
                            aria-hidden="true"
                          >
                            /
                          </span>
                          <a
                            href={`/${repo.namespaceSlug}/${repo.slug}`}
                            className="truncate font-semibold text-accent-600 no-underline hover:underline dark:text-accent-400"
                          >
                            {repo.slug}
                          </a>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="inline-flex items-center rounded border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 capitalize dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">
                          {repo.visibility}
                        </span>
                        {repo.pinned ? (
                          <span className="inline-flex items-center gap-1 rounded border border-accent-500/35 bg-accent-500/10 px-1.5 py-0.5 text-[11px] font-medium text-accent-700 dark:border-accent-400/35 dark:bg-accent-500/15 dark:text-accent-300">
                            <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                            <span>Pinned</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="m-0 line-clamp-2 text-[13px] leading-5 text-zinc-700 dark:text-zinc-200">
                      {repo.description ||
                        "Official open-source repository published by Vib Tools engineering."}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNamespaceFilter(repo.namespaceSlug)}
                        className="inline-flex items-center rounded border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700 transition-colors hover:border-accent-500/50 hover:text-accent-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-accent-400/50 dark:hover:text-accent-300"
                        title={`Filter repositories by @${repo.namespaceSlug}`}
                      >
                        @{repo.namespaceSlug}
                      </button>
                      <span aria-hidden="true">·</span>
                      <span suppressHydrationWarning>
                        Updated {formatRelativeTime(repo.updatedAt)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopyClone(repo)}
                      className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-zinc-300/80 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
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
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Toolbar: Feed switcher (signed in) + Search + Sort + Visibility filter */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
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
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
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
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                }`}
              >
                Public{" "}
                <span className="ml-1 font-mono text-[11px] tabular-nums opacity-75">
                  {publicProjectTotalCount}
                </span>
              </button>
            </div>
          ) : null}

          <div className="relative min-w-[210px] flex-1 sm:w-64 sm:flex-none">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                activeFeed === "public"
                  ? "Search open-source repositories..."
                  : "Filter repositories..."
              }
              aria-label="Filter repositories"
              className="h-8 w-full rounded-md border border-zinc-200 bg-white pr-2.5 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <ArrowUpDown
              className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-300"
              aria-hidden="true"
            />
            <select
              aria-label="Sort repositories"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value === "name" ? "name" : "updated")}
              className="bg-transparent text-xs font-medium text-zinc-800 focus:outline-none dark:text-zinc-100"
            >
              <option
                value="updated"
                className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Sort: Recently updated
              </option>
              <option
                value="name"
                className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Sort: Name (A–Z)
              </option>
            </select>
          </div>

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
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-3 text-xs font-semibold whitespace-nowrap text-white hover:bg-accent-700"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New repository</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Company Teams / Namespaces Filter Strip & .vibtools Profile Repo Toggle (Public Feed) */}
      {activeFeed === "public" && (teamFilterItems.length > 0 || hasProfilePublicRepos) ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
          role="region"
          aria-label="Filter by team namespace"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <Users
                className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <span>Teams:</span>
            </span>

            <button
              type="button"
              onClick={() => setNamespaceFilter("all")}
              aria-pressed={namespaceFilter === "all"}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                namespaceFilter === "all"
                  ? "border-accent-600 bg-accent-600 text-white"
                  : "border-zinc-300/80 bg-zinc-50 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
              }`}
            >
              <span>All Teams</span>
              <span className="font-mono text-[11px] tabular-nums opacity-90">
                {publicProjectTotalCount}
              </span>
            </button>

            {teamFilterItems.map((team) => {
              const isSelected = namespaceFilter === team.slug;
              const teamCount =
                team.projectRepoCount > 0 && !showProfileRepos
                  ? team.projectRepoCount
                  : team.publicRepoCount;
              return (
                <button
                  key={team.slug}
                  type="button"
                  onClick={() =>
                    setNamespaceFilter((current) => (current === team.slug ? "all" : team.slug))
                  }
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-accent-600 bg-accent-600 text-white"
                      : "border-zinc-300/80 bg-zinc-50 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
                  }`}
                  title={
                    team.displayName && team.displayName !== team.slug
                      ? `${team.displayName} (@${team.slug})`
                      : `@${team.slug}`
                  }
                >
                  <span className="font-mono">@{team.slug}</span>
                  <span className="font-mono text-[11px] tabular-nums opacity-85">{teamCount}</span>
                </button>
              );
            })}
          </div>

          {hasProfilePublicRepos && hasNonProfilePublicRepos ? (
            <button
              type="button"
              onClick={() => setShowProfileRepos((prev) => !prev)}
              aria-pressed={showProfileRepos}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                showProfileRepos
                  ? "border-accent-500/40 bg-accent-500/15 text-accent-700 dark:border-accent-400/40 dark:bg-accent-500/20 dark:text-accent-300"
                  : "border-zinc-300/80 bg-zinc-50 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
              }`}
              title="Toggle visibility of internal .vibtools profile README repositories"
            >
              <span>Profile configs ({PROFILE_REPO_SLUG})</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Inline Quick Create Form */}
      {showCreate && primaryNamespaceSlug && canWrite ? (
        <form
          onSubmit={(event) => void handleCreateSubmit(event)}
          className="rounded-md border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="home-new-repo-slug"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-200"
                >
                  Repository name ({primaryNamespaceSlug}/<span className="font-mono">slug</span>)
                </label>
                <button
                  type="button"
                  onClick={() => setNewSlug(PROFILE_REPO_SLUG)}
                  className="rounded border border-zinc-300/80 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  Use {PROFILE_REPO_SLUG}
                </button>
              </div>
              <input
                id="home-new-repo-slug"
                type="text"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                placeholder="edge-worker or .vibtools"
                required
                className="h-8 w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="sm:w-36">
              <label
                htmlFor="home-new-repo-visibility"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-200"
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
                className="inline-flex h-8 items-center rounded-md border border-zinc-300/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
            <input
              type="text"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              maxLength={200}
              placeholder="Optional description..."
              aria-label="Repository description"
              className="h-8 w-full rounded-md border border-zinc-300 bg-zinc-50 px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            {isProfileSlug ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={initProfileReadme}
                  onChange={(event) => setInitProfileReadme(event.target.checked)}
                />
                <span>
                  Initialize <code className="font-mono">{PROFILE_README_PATH}</code>
                </span>
              </label>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={initReadme}
                  onChange={(event) => setInitReadme(event.target.checked)}
                />
                <span>
                  Initialize with <code className="font-mono">README.md</code>
                </span>
              </label>
            )}
          </div>
          {createError ? (
            <p className="m-0 mt-2 text-xs text-red-600 dark:text-red-400">{createError}</p>
          ) : null}
        </form>
      ) : null}

      {/* Main Repository Catalog List */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-zinc-400" aria-hidden="true" />
          <p className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {sourceList.length === 0
              ? activeFeed === "public"
                ? "No public repositories published yet"
                : "No repositories yet"
              : "No matching repositories"}
          </p>
          <p className="m-0 mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {sourceList.length === 0
              ? signedIn
                ? "Use + in the top header or New repository above to create one."
                : "Sign in to initialize starter repositories or publish your first public repo."
              : "Adjust your search query, team namespace filter, or visibility filter."}
          </p>
          {sourceList.length > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-300/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset filters</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/90 px-4 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/35 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {activeFeed === "public" ? "Public Repositories" : "Workspace Repositories"}
              {namespaceFilter !== "all" && activeFeed === "public" ? (
                <span className="ml-1.5 font-mono text-accent-600 dark:text-accent-400">
                  (@{namespaceFilter})
                </span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-300">
              Showing {filtered.length} {filtered.length === 1 ? "repository" : "repositories"}
            </span>
          </div>

          <ul className="m-0 list-none divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
            {filtered.map((repo) => {
              const isPrivate = repo.visibility === "private";
              const isCopied = copiedId === repo.id;
              return (
                <li
                  key={repo.id}
                  className="flex flex-col justify-between gap-2.5 px-4 py-3 transition-colors hover:bg-zinc-50/80 sm:flex-row sm:items-center dark:hover:bg-zinc-800/35"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm tracking-tight">
                      {isPrivate ? (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Globe
                          className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                          aria-hidden="true"
                        />
                      )}
                      <div className="flex min-w-0 items-center truncate">
                        <a
                          href={buildNamespaceProfileHref(repo.namespaceSlug)}
                          className="font-medium text-zinc-700 no-underline hover:text-accent-600 hover:underline dark:text-zinc-200 dark:hover:text-accent-400"
                        >
                          {repo.namespaceSlug}
                        </a>
                        <span className="mx-1 text-zinc-400 dark:text-zinc-500" aria-hidden="true">
                          /
                        </span>
                        <a
                          href={`/${repo.namespaceSlug}/${repo.slug}`}
                          className="truncate font-semibold text-accent-600 no-underline hover:underline dark:text-accent-400"
                        >
                          {repo.slug}
                        </a>
                      </div>

                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize ${
                          isPrivate
                            ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-300"
                            : "border-zinc-200 bg-zinc-100/80 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200"
                        }`}
                      >
                        {repo.visibility}
                      </span>

                      {repo.pinned ? (
                        <span className="inline-flex items-center gap-1 rounded border border-accent-500/35 bg-accent-500/10 px-1.5 py-0.5 text-[11px] font-medium text-accent-700 dark:border-accent-400/35 dark:bg-accent-500/15 dark:text-accent-300">
                          <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>Pinned</span>
                        </span>
                      ) : null}
                    </div>

                    {repo.description ? (
                      <p className="m-0 line-clamp-1 text-[13px] leading-5 text-zinc-700 dark:text-zinc-200">
                        {repo.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <a
                        href={buildNamespaceProfileHref(repo.namespaceSlug)}
                        className="font-mono text-xs text-zinc-600 no-underline hover:text-accent-600 hover:underline dark:text-zinc-300 dark:hover:text-accent-400"
                      >
                        Team @{repo.namespaceSlug}
                      </a>
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
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
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
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 no-underline transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
                      title="View commits"
                    >
                      <GitCommitHorizontal className="h-3 w-3" aria-hidden="true" />
                      <span className="hidden md:inline">Commits</span>
                    </a>
                    {signedIn && activeFeed === "mine" ? (
                      <a
                        href={`/${repo.namespaceSlug}/${repo.slug}/admin`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 no-underline transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
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

  // Anonymous homepage or /explore: 2-column Company Portal layout with Organization & Teams sidebar
  if (!signedIn || exploreOnly) {
    return (
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">{repoListPanel}</div>

        <aside className="space-y-3.5" aria-label="Organization and teams summary">
          {/* Card 1: Organization Overview */}
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/90 px-3.5 py-2 text-xs font-semibold text-zinc-950 dark:border-zinc-800 dark:bg-zinc-800/35 dark:text-zinc-100">
              <Building2
                className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
              <span>Organization Overview</span>
            </div>

            <div className="space-y-2.5 p-3.5 text-xs">
              <div>
                <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  Vib Tools
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Open-Source &amp; Engineering Forge
                </div>
              </div>

              <p className="m-0 text-[13px] leading-5 text-zinc-700 dark:text-zinc-200">
                Official open-source releases, developer kits, and edge-native Git infrastructure
                built by Vib Tools engineering teams.
              </p>

              <div className="space-y-1.5 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                <a
                  href="https://vibtools.io/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 text-zinc-800 no-underline hover:text-accent-600 dark:text-zinc-200 dark:hover:text-accent-400"
                >
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Globe
                      className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                      aria-hidden="true"
                    />
                    <span>vibtools.io</span>
                  </span>
                  <ExternalLink
                    className="h-3 w-3 text-zinc-400 dark:text-zinc-300"
                    aria-hidden="true"
                  />
                </a>

                <a
                  href="mailto:support@vibtools.io"
                  className="flex items-center gap-1.5 text-zinc-700 no-underline hover:text-accent-600 dark:text-zinc-300 dark:hover:text-accent-400"
                >
                  <Mail
                    className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-300"
                    aria-hidden="true"
                  />
                  <span className="truncate font-mono text-xs">support@vibtools.io</span>
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: Teams & Namespaces Directory */}
          {teamFilterItems.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/90 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-800/35">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-950 dark:text-zinc-100">
                  <Users
                    className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                    aria-hidden="true"
                  />
                  <span>Teams &amp; Namespaces</span>
                </div>
                <span className="rounded border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700 tabular-nums dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">
                  {teamFilterItems.length}
                </span>
              </div>

              <ul className="m-0 list-none divide-y divide-zinc-200 p-0 text-xs dark:divide-zinc-800">
                {teamFilterItems.map((team) => {
                  const isSelected = namespaceFilter === team.slug;
                  const teamCount =
                    team.projectRepoCount > 0 && !showProfileRepos
                      ? team.projectRepoCount
                      : team.publicRepoCount;
                  return (
                    <li key={`sidebar-team-${team.slug}`} className="space-y-2 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <a
                            href={buildNamespaceProfileHref(team.slug)}
                            className="block truncate text-[13px] font-semibold text-zinc-950 no-underline hover:text-accent-600 hover:underline dark:text-zinc-100 dark:hover:text-accent-400"
                          >
                            {team.displayName || team.slug}
                          </a>
                          <a
                            href={buildNamespaceProfileHref(team.slug)}
                            className="block truncate font-mono text-xs text-accent-600 no-underline hover:underline dark:text-accent-400"
                          >
                            @{team.slug}
                          </a>
                        </div>

                        <span className="shrink-0 rounded border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700 tabular-nums dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">
                          {teamCount} {teamCount === 1 ? "repo" : "repos"}
                        </span>
                      </div>

                      {team.bio ? (
                        <p className="m-0 line-clamp-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                          {team.bio}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setNamespaceFilter((current) =>
                              current === team.slug ? "all" : team.slug
                            )
                          }
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors ${
                            isSelected
                              ? "border-accent-600 bg-accent-600 text-white"
                              : "border-zinc-300/80 bg-zinc-50 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
                          }`}
                        >
                          {isSelected ? "Active filter" : `Filter @${team.slug}`}
                        </button>

                        <a
                          href={buildNamespaceProfileHref(team.slug)}
                          className="text-xs font-medium text-accent-600 no-underline hover:underline dark:text-accent-400"
                        >
                          Profile →
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Card 3: Private & Backup Repositories Notice */}
          {!signedIn ? (
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/90 px-3.5 py-2 text-xs font-semibold text-zinc-950 dark:border-zinc-800 dark:bg-zinc-800/35 dark:text-zinc-100">
                <Lock
                  className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>Private &amp; Backup Repositories</span>
              </div>

              <div className="space-y-2.5 p-3.5 text-xs">
                <p className="m-0 text-[13px] leading-5 text-zinc-700 dark:text-zinc-200">
                  Internal company backups, private product builds, and restricted engineering
                  repositories are hidden from the public catalog and require team authentication.
                </p>

                <a
                  href="/auth"
                  className="inline-flex h-7 w-full items-center justify-center rounded-md border border-zinc-300/80 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-800 no-underline transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  Sign in to Team Workspace
                </a>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    );
  }

  // Signed-in Gitea-style 2-column dashboard: main repositories feed + compact workspace panel
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
      <div className="min-w-0">{repoListPanel}</div>

      <aside className="space-y-3.5" aria-label="Workspace summary">
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 bg-zinc-50/90 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/35">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-100">
                {primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "Workspace"}
              </span>
              <span className="rounded border border-zinc-200 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">
                {viewerRole}
              </span>
            </div>
            {displayName ? (
              <p className="m-0 mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-300">
                {displayName}
              </p>
            ) : null}
          </div>

          <nav className="divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
            <a
              href="/user/profile"
              className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:hover:text-white"
            >
              <User className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>User Profile</span>
            </a>
            <a
              href="/user/settings"
              className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:hover:text-white"
            >
              <Settings className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>User Settings</span>
            </a>
            <a
              href="/user/settings/tokens"
              className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:hover:text-white"
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
                  className="flex items-center gap-2 px-3.5 py-2 text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:hover:text-white"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  <span>Settings Control Panel</span>
                </a>
              </>
            ) : null}
          </nav>
        </div>

        {namespaces.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 bg-zinc-50/90 px-3.5 py-2 text-xs font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800/35 dark:text-zinc-100">
              Namespaces
            </div>
            <div className="flex flex-wrap gap-1.5 p-3">
              {namespaces.map((ns) => (
                <a
                  key={ns.id}
                  href={buildNamespaceProfileHref(ns.slug)}
                  className="inline-flex items-center rounded border border-zinc-300/80 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-700 no-underline hover:border-accent-500/40 hover:text-accent-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:text-accent-400"
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
