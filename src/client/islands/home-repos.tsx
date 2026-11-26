/// <reference lib="dom" />

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  FolderGit2,
  GitCommitHorizontal,
  Globe,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";

import {
  buildGitCloneUrl,
  buildNamespaceProfileHref,
  canAccessAdminPanel,
  canWriteRepositories,
  selectHomeFeaturedRepositories,
  type DirectoryRole,
} from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  type SiteBrandingConfig,
} from "@/shared/branding";
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
  homePinned?: boolean;
  updatedAt: number;
  language?: string;
  langColor?: string;
  license?: string;
  branch?: string;
  version?: string;
  topics?: string[];
};

export type HomeReposIslandProps = {
  signedIn?: boolean;
  exploreOnly?: boolean;
  origin: string;
  branding?: SiteBrandingConfig;
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

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  Python: "#3572A5",
  JavaScript: "#f1e05a",
  Rust: "#dea584",
  Go: "#00ADD8",
  HTML: "#e34c26",
  CSS: "#563d7c",
};

function resolveRepoLanguage(repo: HomeRepositoryItem): { name: string; color: string } | null {
  if (repo.language) {
    return {
      name: repo.language,
      color: repo.langColor ?? LANGUAGE_COLORS[repo.language] ?? "#a1a1aa",
    };
  }
  const text = `${repo.slug} ${repo.description ?? ""}`;
  if (/\btypescript\b|\bworker\b|\btsx\b/i.test(text)) {
    return { name: "TypeScript", color: LANGUAGE_COLORS.TypeScript! };
  }
  if (/\bpython\b/i.test(text)) {
    return { name: "Python", color: LANGUAGE_COLORS.Python! };
  }
  if (/\brust\b/i.test(text)) {
    return { name: "Rust", color: LANGUAGE_COLORS.Rust! };
  }
  if (/\bgolang\b|\bgo\b/i.test(text)) {
    return { name: "Go", color: LANGUAGE_COLORS.Go! };
  }
  if (/\bjavascript\b|\bnode\b/i.test(text)) {
    return { name: "JavaScript", color: LANGUAGE_COLORS.JavaScript! };
  }
  return null;
}

export function HomeReposIsland({
  signedIn = false,
  exploreOnly = false,
  origin,
  branding,
  primaryNamespaceSlug,
  displayName,
  viewerRole = "member",
  namespaces = [],
  publicNamespaces = [],
  repositories: initialRepos,
  publicRepositories = [],
}: HomeReposIslandProps) {
  const resolvedBranding = branding ?? DEFAULT_SITE_BRANDING;
  const cloneBaseOrigin = (origin || resolvedBranding.websiteUrl || "https://example.com").replace(
    /\/+$/,
    ""
  );
  const websiteDisplayLabel =
    resolvedBranding.websiteLabel || extractHostLabel(resolvedBranding.websiteUrl);
  const isAdmin = signedIn && canAccessAdminPanel(viewerRole);
  const canWrite = signedIn && canWriteRepositories(viewerRole);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [repositories, setRepositories] = useState<HomeRepositoryItem[]>(initialRepos);
  const [activeFeed, setActiveFeed] = useState<"mine" | "public">(
    !signedIn || exploreOnly ? "public" : "mine"
  );
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName;
      if (event.key === "/" && activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    for (const repo of sourceList) {
      const lang = resolveRepoLanguage(repo);
      if (lang) set.add(lang.name);
    }
    if (set.size === 0) {
      set.add("TypeScript");
      set.add("Python");
    }
    return Array.from(set);
  }, [sourceList]);

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

  const featuredRepositories = useMemo(
    () => selectHomeFeaturedRepositories(publicRepositories),
    [publicRepositories]
  );

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
      if (languageFilter !== "all") {
        const lang = resolveRepoLanguage(repo);
        if (!lang || lang.name !== languageFilter) {
          return false;
        }
      }
      if (!q) return true;
      const matchesTopic = (repo.topics ?? []).some((t) => t.toLowerCase().includes(q));
      return (
        `${repo.namespaceSlug}/${repo.slug}`.toLowerCase().includes(q) ||
        repo.slug.toLowerCase().includes(q) ||
        repo.namespaceSlug.toLowerCase().includes(q) ||
        (repo.description ?? "").toLowerCase().includes(q) ||
        matchesTopic
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
    languageFilter,
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
      }, 1300);
    } catch {
      // Clipboard API unavailable in restricted contexts; ignore silently.
    }
  }

  function handleResetFilters() {
    setQuery("");
    setLanguageFilter("all");
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

  // Anonymous homepage or /explore: Exact 2-column layout from index.html SSOT
  if (!signedIn || exploreOnly) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Pinned Repositories */}
          {featuredRepositories.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[14px] font-semibold text-fg">Pinned Repositories</h2>
                <span className="text-[12px] text-fgMuted">
                  Flagship releases &amp; starter kits
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {featuredRepositories.map((repo) => {
                  const isCopied = copiedId === repo.id;
                  const langInfo = resolveRepoLanguage(repo);
                  return (
                    <article
                      key={`featured-${repo.id}`}
                      className="bg-surface border border-border hover:border-borderHover rounded-md p-4 flex flex-col justify-between gap-3.5 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={`/${repo.namespaceSlug}/${repo.slug}`}
                            className="text-[14px] font-semibold truncate no-underline"
                          >
                            <span className="text-fgMuted font-normal">
                              {repo.namespaceSlug} /{" "}
                            </span>
                            <span className="text-fg hover:text-accent transition-colors">
                              {repo.slug}
                            </span>
                          </a>
                          <span className="text-[12px] text-fgMuted">
                            {repo.visibility === "private" ? "Private" : "Public"}
                          </span>
                        </div>
                        <p className="m-0 text-[13px] text-fgBody line-clamp-2">
                          {repo.description ||
                            "Official open-source repository published by Vib Tools."}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[12px] text-fgMuted pt-1">
                        <div className="flex items-center gap-3.5">
                          {langInfo ? (
                            <span className="inline-flex items-center gap-1.5 text-fgBody">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: langInfo.color }}
                              />
                              {langInfo.name}
                            </span>
                          ) : null}
                          {repo.license ? <span>{repo.license}</span> : null}
                          {repo.version ? <span className="font-mono">{repo.version}</span> : null}
                          {!repo.license && !repo.version ? (
                            <span suppressHydrationWarning>
                              Updated {formatRelativeTime(repo.updatedAt)}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyClone(repo)}
                          className={`font-medium transition-colors ${
                            isCopied ? "text-emerald-400" : "text-fgBody hover:text-fg"
                          }`}
                        >
                          {isCopied ? "Copied" : "Clone"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* All Public Repositories */}
          <section id="repositories" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="m-0 text-[14px] font-semibold text-fg">All Repositories</h2>
              <div className="flex items-center gap-3 text-[12px] text-fgMuted">
                {hasProfilePublicRepos ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowProfileRepos((prev) => !prev)}
                      aria-pressed={showProfileRepos}
                      className={`transition-colors ${
                        showProfileRepos ? "text-fg font-medium" : "text-fgMuted hover:text-fg"
                      }`}
                    >
                      .vibtools configs
                    </button>
                    <span>·</span>
                  </>
                ) : null}
                <span id="repoCountLabel">
                  {filtered.length} {filtered.length === 1 ? "repository" : "repositories"}
                </span>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-md overflow-hidden">
              {/* Toolbar: Search + Dropdowns */}
              <div className="p-3 border-b border-borderSubtle flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <svg
                    className="w-3.5 h-3.5 text-fgMuted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    id="searchInput"
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search repositories, topics, or descriptions..."
                    aria-label="Search repositories"
                    className="w-full h-8 pl-8 pr-7 rounded-md bg-canvas border border-border text-[13px] text-fg placeholder:text-fgMuted focus:outline-none focus:border-fgMuted"
                  />
                  <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-fgMuted">
                    /
                  </kbd>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    id="langFilter"
                    aria-label="Filter by language"
                    value={languageFilter}
                    onChange={(event) => setLanguageFilter(event.target.value)}
                    className="h-8 px-2.5 rounded-md bg-canvas hover:bg-surfaceHover border border-border text-[12px] text-fgBody focus:outline-none focus:border-fgMuted cursor-pointer"
                  >
                    <option value="all">Language: All</option>
                    {availableLanguages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                  <select
                    id="sortFilter"
                    aria-label="Sort repositories"
                    value={sortBy}
                    onChange={(event) =>
                      setSortBy(event.target.value === "name" ? "name" : "updated")
                    }
                    className="h-8 px-2.5 rounded-md bg-canvas hover:bg-surfaceHover border border-border text-[12px] text-fgBody focus:outline-none focus:border-fgMuted cursor-pointer"
                  >
                    <option value="updated">Sort: Recently updated</option>
                    <option value="name">Sort: Name (A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Team Filter Strip */}
              <div className="px-3.5 py-2 bg-canvas/50 border-b border-border flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="text-fgMuted mr-1">Teams:</span>
                <button
                  type="button"
                  data-team="all"
                  onClick={() => setNamespaceFilter("all")}
                  className={
                    namespaceFilter === "all"
                      ? "team-pill px-2.5 py-0.5 rounded bg-fg text-canvas font-medium transition-colors"
                      : "team-pill px-2.5 py-0.5 rounded text-fgBody hover:text-fg hover:bg-surfaceHover transition-colors"
                  }
                >
                  All{" "}
                  <span
                    className={
                      namespaceFilter === "all" ? "opacity-70 ml-0.5" : "text-fgMuted ml-0.5"
                    }
                  >
                    {publicProjectTotalCount}
                  </span>
                </button>
                {teamFilterItems.map((team) => {
                  const isActive = namespaceFilter === team.slug;
                  const teamCount =
                    team.projectRepoCount > 0 && !showProfileRepos
                      ? team.projectRepoCount
                      : team.publicRepoCount;
                  return (
                    <button
                      key={team.slug}
                      type="button"
                      data-team={team.slug}
                      onClick={() =>
                        setNamespaceFilter((current) => (current === team.slug ? "all" : team.slug))
                      }
                      className={
                        isActive
                          ? "team-pill px-2.5 py-0.5 rounded bg-fg text-canvas font-medium transition-colors"
                          : "team-pill px-2.5 py-0.5 rounded text-fgBody hover:text-fg hover:bg-surfaceHover transition-colors"
                      }
                    >
                      @{team.slug}{" "}
                      <span className={isActive ? "opacity-70 ml-0.5" : "text-fgMuted ml-0.5"}>
                        {teamCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Repository Rows */}
              <div id="repoList" className="divide-y divide-borderSubtle">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-fgMuted text-[13px]">
                    No public repositories match your current filter.
                  </div>
                ) : (
                  filtered.map((repo) => {
                    const isCopied = copiedId === repo.id;
                    const langInfo = resolveRepoLanguage(repo);
                    return (
                      <article
                        key={repo.id}
                        className="p-4 hover:bg-surfaceHover/60 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                      >
                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`/${repo.namespaceSlug}/${repo.slug}`}
                              className="text-[14px] font-semibold no-underline"
                            >
                              <span className="text-fgMuted font-normal">
                                {repo.namespaceSlug} /{" "}
                              </span>
                              <span className="text-fg hover:text-accent transition-colors">
                                {repo.slug}
                              </span>
                            </a>
                            <span className="text-[12px] text-fgMuted">
                              {repo.visibility === "private" ? "Private" : "Public"}
                              {repo.homePinned ? " · Homepage" : repo.pinned ? " · Pinned" : ""}
                            </span>
                          </div>

                          {repo.description ? (
                            <p className="m-0 text-[13px] text-fgBody max-w-2xl">
                              {repo.description}
                            </p>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-[12px] text-fgMuted">
                            {langInfo ? (
                              <span className="inline-flex items-center gap-1.5 text-fgBody">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: langInfo.color }}
                                />
                                {langInfo.name}
                              </span>
                            ) : null}
                            {repo.license ? <span>{repo.license}</span> : null}
                            {repo.branch || repo.version ? (
                              <span className="font-mono">
                                {[repo.branch, repo.version].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                            <span suppressHydrationWarning>
                              Updated {formatRelativeTime(repo.updatedAt)}
                            </span>
                          </div>

                          {repo.topics && repo.topics.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {repo.topics.map((topic) => (
                                <span
                                  key={topic}
                                  className="px-2 py-0.5 rounded bg-canvas border border-borderSubtle text-[12px] text-fgMuted"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => void handleCopyClone(repo)}
                            className={`h-7 px-3 rounded-md bg-canvas hover:bg-surfaceHover border border-border text-[12px] transition-colors ${
                              isCopied ? "text-emerald-400" : "text-fgBody hover:text-fg"
                            }`}
                          >
                            {isCopied ? "Copied" : "Clone"}
                          </button>
                          <a
                            href={`/${repo.namespaceSlug}/${repo.slug}/commits`}
                            className="h-7 px-3 rounded-md bg-canvas hover:bg-surfaceHover border border-border text-[12px] text-fgBody hover:text-fg inline-flex items-center transition-colors no-underline"
                          >
                            Commits
                          </a>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Sidebar (4 cols) */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Organization Details */}
          <section className="bg-surface border border-border rounded-md p-4 space-y-3">
            <div className="text-[12px] font-semibold text-fg">
              {resolvedBranding.shortName} · Organization
            </div>
            {resolvedBranding.heroDescription ? (
              <p className="m-0 text-[13px] text-fgBody">{resolvedBranding.heroDescription}</p>
            ) : null}
            {resolvedBranding.websiteUrl || resolvedBranding.supportEmail ? (
              <div className="pt-3 border-t border-borderSubtle space-y-2 text-[12px]">
                {resolvedBranding.websiteUrl ? (
                  <a
                    href={resolvedBranding.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between text-fgBody hover:text-fg transition-colors no-underline"
                  >
                    <span>{websiteDisplayLabel}</span>
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
                {resolvedBranding.supportEmail ? (
                  <a
                    href={`mailto:${resolvedBranding.supportEmail}`}
                    className="block text-fgBody hover:text-fg transition-colors no-underline"
                  >
                    {resolvedBranding.supportEmail}
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Teams & Namespaces */}
          <section
            id="teams"
            className="bg-surface border border-border rounded-md overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-borderSubtle flex items-center justify-between text-[12px]">
              <span className="font-semibold text-fg">Teams &amp; Namespaces</span>
              <span className="text-fgMuted">{teamFilterItems.length}</span>
            </div>

            <div className="divide-y divide-borderSubtle">
              {teamFilterItems.map((team) => {
                const isSelected = namespaceFilter === team.slug;
                const teamCount =
                  team.projectRepoCount > 0 && !showProfileRepos
                    ? team.projectRepoCount
                    : team.publicRepoCount;
                return (
                  <div key={`sidebar-team-${team.slug}`} className="p-4 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate">
                        <span className="text-[13px] font-semibold text-fg">
                          {team.displayName || team.slug}
                        </span>
                        <span className="text-[12px] text-fgMuted ml-1.5">@{team.slug}</span>
                      </div>
                      <span className="text-[12px] text-fgMuted shrink-0">
                        {teamCount} {teamCount === 1 ? "repo" : "repos"}
                      </span>
                    </div>
                    {team.bio ? <p className="m-0 text-[13px] text-fgBody">{team.bio}</p> : null}
                    <div className="flex items-center justify-between pt-1 text-[12px]">
                      <button
                        type="button"
                        onClick={() =>
                          setNamespaceFilter((current) =>
                            current === team.slug ? "all" : team.slug
                          )
                        }
                        className={
                          isSelected
                            ? "text-fg font-medium transition-colors"
                            : "text-fgBody hover:text-fg transition-colors"
                        }
                      >
                        Filter repos
                      </button>
                      <a
                        href={buildNamespaceProfileHref(team.slug)}
                        className="text-accent hover:underline no-underline"
                      >
                        Profile →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Developer Access */}
          <section className="bg-surface border border-border rounded-md p-4 space-y-2.5">
            <div className="text-[12px] font-semibold text-fg">Developer Access</div>
            <p className="m-0 text-[13px] text-fgBody">
              All public repositories support anonymous HTTPS cloning under permissive open-source
              licenses.
            </p>
            <div className="px-3 py-2 rounded bg-canvas border border-borderSubtle font-mono text-[12px] text-fgBody truncate">
              git clone {cloneBaseOrigin}/&lt;ns&gt;/&lt;repo&gt;.git
            </div>
          </section>
        </aside>
      </div>
    );
  }

  // Signed-in workspace dashboard view
  return (
    <div className="space-y-5">
      {/* Header + Primary CTA Row */}
      <header className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div className="space-y-0.5">
          <p className="m-0 text-[12px] font-medium text-fgBody">
            {resolvedBranding.workspaceName}
          </p>
          <h1 className="m-0 text-[20px] font-semibold tracking-tight text-fg">Repositories</h1>
          <p className="m-0 text-[13px] text-fgBody">
            Manage your team namespaces, private organization backups, and public open-source
            repositories.
          </p>
        </div>

        {primaryNamespaceSlug && canWrite ? (
          <button
            type="button"
            onClick={() => {
              setShowCreate((open) => !open);
              setCreateError(null);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[12px] font-semibold whitespace-nowrap text-canvas transition-colors hover:bg-fgHover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New repository</span>
          </button>
        ) : null}
      </header>

      {/* Inline Quick Create Form */}
      {showCreate && primaryNamespaceSlug && canWrite ? (
        <form
          onSubmit={(event) => void handleCreateSubmit(event)}
          className="rounded-md border border-border bg-surface p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="home-new-repo-slug"
                  className="block text-[12px] font-medium text-fgBody"
                >
                  Repository name ({primaryNamespaceSlug}/<span className="font-mono">slug</span>)
                </label>
                <button
                  type="button"
                  onClick={() => setNewSlug(PROFILE_REPO_SLUG)}
                  className="rounded border border-border bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fgBody hover:bg-surfaceHover hover:text-fg"
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
                className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 font-mono text-[12px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
              />
            </div>
            <div className="sm:w-36">
              <label
                htmlFor="home-new-repo-visibility"
                className="mb-1 block text-[12px] font-medium text-fgBody"
              >
                Visibility
              </label>
              <select
                id="home-new-repo-visibility"
                value={newVisibility}
                onChange={(event) =>
                  setNewVisibility(event.target.value === "private" ? "private" : "public")
                }
                className="h-8 w-full rounded-md border border-border bg-canvas px-2 text-[12px] text-fg focus:border-fgMuted focus:outline-none"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={creating || !newSlug.trim()}
                className="inline-flex h-8 items-center rounded-md bg-fg px-3 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="inline-flex h-8 items-center rounded-md border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
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
              className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 text-[12px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
            />
            {isProfileSlug ? (
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fgBody">
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
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fgBody">
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
          {createError ? <p className="m-0 mt-2 text-[12px] text-red-400">{createError}</p> : null}
        </form>
      ) : null}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols) — Unified Repository Explorer Card */}
        <div className="lg:col-span-8">
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {/* Toolbar Row 1: Search + Sort + Visibility */}
            <div className="flex flex-col items-stretch gap-2 border-b border-borderSubtle p-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <svg
                  className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fgMuted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter repositories..."
                  aria-label="Filter repositories"
                  className="h-8 w-full rounded-md border border-border bg-canvas pr-8 pl-8 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fgMuted">
                  /
                </kbd>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Sort repositories"
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value === "name" ? "name" : "updated")
                  }
                  className="h-8 cursor-pointer rounded-md border border-border bg-canvas px-2.5 text-[12px] text-fgBody hover:bg-surfaceHover focus:border-fgMuted focus:outline-none"
                >
                  <option value="updated">Sort: Recently updated</option>
                  <option value="name">Sort: Name (A–Z)</option>
                </select>

                {activeFeed === "mine" ? (
                  <div
                    className="inline-flex h-8 items-center rounded-md border border-border bg-canvas p-0.5"
                    role="group"
                    aria-label="Filter by visibility"
                  >
                    {(["all", "public", "private"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setVisibilityFilter(option)}
                        className={`h-full rounded px-2.5 text-[12px] font-medium capitalize transition-colors ${
                          visibilityFilter === option
                            ? "bg-fg text-canvas"
                            : "text-fgBody hover:text-fg"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Toolbar Row 2: Scope Tabs + Summary Count */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-canvas/50 px-3.5 py-2 text-[12px]">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="Repository scope"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeFeed === "mine"}
                  onClick={() => setActiveFeed("mine")}
                  className={`rounded px-2.5 py-0.5 font-medium whitespace-nowrap transition-colors ${
                    activeFeed === "mine"
                      ? "bg-fg text-canvas"
                      : "text-fgBody hover:bg-surfaceHover hover:text-fg"
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
                  className={`rounded px-2.5 py-0.5 font-medium whitespace-nowrap transition-colors ${
                    activeFeed === "public"
                      ? "bg-fg text-canvas"
                      : "text-fgBody hover:bg-surfaceHover hover:text-fg"
                  }`}
                >
                  Public{" "}
                  <span className="ml-1 font-mono text-[11px] tabular-nums opacity-75">
                    {publicProjectTotalCount}
                  </span>
                </button>
              </div>

              <div className="text-[12px] text-fgMuted">
                <span className="font-semibold text-fg">
                  {activeFeed === "public" ? "Public Repositories" : "Workspace Repositories"}
                </span>{" "}
                · {filtered.length} {filtered.length === 1 ? "repository" : "repositories"}
              </div>
            </div>

            {/* Divided Repository Rows */}
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-fgMuted" aria-hidden="true" />
                <p className="m-0 text-[14px] font-semibold text-fg">
                  {sourceList.length === 0 ? "No repositories yet" : "No matching repositories"}
                </p>
                <p className="m-0 mt-1 text-[12px] text-fgMuted">
                  {sourceList.length === 0
                    ? "Use + in the top header or New repository above to create one."
                    : "Adjust your search query or visibility filter."}
                </p>
                {sourceList.length > 0 ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Reset filters</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="divide-y divide-borderSubtle">
                {filtered.map((repo) => {
                  const isPrivate = repo.visibility === "private";
                  const isCopied = copiedId === repo.id;
                  return (
                    <article
                      key={repo.id}
                      className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-surfaceHover/60 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {isPrivate ? (
                            <Lock
                              className="h-3.5 w-3.5 shrink-0 text-amber-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <Globe
                              className="h-3.5 w-3.5 shrink-0 text-fgMuted"
                              aria-hidden="true"
                            />
                          )}
                          <a
                            href={`/${repo.namespaceSlug}/${repo.slug}`}
                            className="text-[14px] font-semibold no-underline"
                          >
                            <span className="font-normal text-fgMuted">
                              {repo.namespaceSlug} /{" "}
                            </span>
                            <span className="text-fg transition-colors hover:text-accent">
                              {repo.slug}
                            </span>
                          </a>
                          <span className="text-[12px] text-fgMuted capitalize">
                            {repo.visibility}
                            {repo.pinned ? " · Pinned" : ""}
                            {repo.homePinned ? " · Homepage" : ""}
                          </span>
                        </div>

                        {repo.description ? (
                          <p className="m-0 text-[13px] text-fgBody">{repo.description}</p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3 text-[12px] text-fgMuted">
                          <a
                            href={buildNamespaceProfileHref(repo.namespaceSlug)}
                            className="font-mono text-fgBody no-underline hover:text-fg"
                          >
                            @{repo.namespaceSlug}
                          </a>
                          <span aria-hidden="true">·</span>
                          <span suppressHydrationWarning>
                            Updated {formatRelativeTime(repo.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopyClone(repo)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-canvas px-3 text-[12px] text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                              <span className="text-emerald-400">Copied</span>
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
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-canvas px-3 text-[12px] text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
                        >
                          <GitCommitHorizontal className="h-3 w-3" aria-hidden="true" />
                          <span>Commits</span>
                        </a>
                        {activeFeed === "mine" ? (
                          <a
                            href={`/${repo.namespaceSlug}/${repo.slug}/admin`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-canvas px-3 text-[12px] text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
                          >
                            <Settings className="h-3 w-3" aria-hidden="true" />
                            <span>Settings</span>
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar (4 cols) */}
        <aside className="space-y-5 lg:col-span-4" aria-label="Workspace summary">
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <div className="border-b border-borderSubtle px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[12px] font-semibold text-fg">
                  {primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "Workspace"}
                </span>
                <span className="rounded border border-border bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fgBody">
                  {viewerRole}
                </span>
              </div>
              {displayName ? (
                <p className="m-0 mt-0.5 truncate text-[12px] text-fgMuted">{displayName}</p>
              ) : null}
            </div>

            <nav className="divide-y divide-borderSubtle text-[12px]">
              <a
                href="/user/profile"
                className="flex items-center gap-2 px-4 py-2.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <User className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                <span>User Profile</span>
              </a>
              <a
                href="/user/settings"
                className="flex items-center gap-2 px-4 py-2.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <Settings className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                <span>User Settings</span>
              </a>
              <a
                href="/user/settings/tokens"
                className="flex items-center gap-2 px-4 py-2.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <KeyRound className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                <span>Access Tokens</span>
              </a>
              {isAdmin ? (
                <>
                  <a
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-2.5 font-medium text-accent no-underline hover:bg-surfaceHover"
                  >
                    <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Site Administration</span>
                  </a>
                  <a
                    href="/admin/settings"
                    className="flex items-center gap-2 px-4 py-2.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                    <span>Settings Control Panel</span>
                  </a>
                </>
              ) : null}
            </nav>
          </div>

          {namespaces.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="border-b border-borderSubtle px-4 py-2.5 text-[12px] font-semibold text-fg">
                Namespaces
              </div>
              <div className="flex flex-wrap gap-1.5 p-3.5">
                {namespaces.map((ns) => (
                  <a
                    key={ns.id}
                    href={buildNamespaceProfileHref(ns.slug)}
                    className="inline-flex items-center rounded border border-border bg-canvas px-2 py-0.5 font-mono text-[12px] text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    @{ns.slug}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export function initHomeReposIsland() {
  hydrateIsland<HomeReposIslandProps>("home-repos", HomeReposIsland);
}
