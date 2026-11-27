/// <reference lib="dom" />

import { useMemo, useState } from "react";
import {
  BookOpen,
  FolderGit2,
  Globe,
  Home,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import { sanitizeMarkdownHtml } from "@/client/components/markdownHtmlSanitizer";
import { ErrorBanner, showToast } from "@/client/components/ui";
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
        className="inline-flex h-8 items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
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
        const msg = "Session expired — please sign in again.";
        setSessionExpired(true);
        setError(msg);
        showToast({ tone: "error", title: "Session expired", message: msg });
        return;
      }
      const body = (await response.json().catch(() => null)) as CreateProfileRepoResponse | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        const msg = `Failed (${reason ?? "error"})`;
        setError(msg);
        showToast({ tone: "error", title: "Could not create profile repo", message: msg });
        return;
      }
      window.location.assign(`/${encodeURIComponent(body.namespaceSlug)}/${body.slug}`);
    } catch {
      const msg = "Network error";
      setError(msg);
      showToast({ tone: "error", title: "Could not create profile repo", message: msg });
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
        className="inline-flex h-8 items-center gap-1.5 rounded-none bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{creating ? "Creating .vibtools…" : "Create .vibtools profile"}</span>
      </button>
      {error ? (
        <span role="alert" className="text-[11px] text-red-400">
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
  homePinned?: boolean;
  updatedAt?: number;
};

export type OwnerReposIslandProps = {
  owner: string;
  canManageProfile: boolean;
  canPinRepos?: boolean;
  canFeatureHomepage?: boolean;
  hasProfileRepo?: boolean;
  profileRepoVisibility?: "public" | "private";
  profileReadmeHtml?: string;
  profileReadmePath?: string;
  profileRef?: string;
  repos: OwnerRepoSummary[];
};

type PinToggleResponse =
  { ok: true; pinned: boolean; homePinned?: boolean } | { ok: false; reason?: string };

export function OwnerReposIsland({
  owner,
  canManageProfile,
  canPinRepos = canManageProfile,
  canFeatureHomepage = false,
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
  const [homePinPendingId, setHomePinPendingId] = useState<string | null>(null);
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
    if (!canPinRepos || !repo.id || pinPendingId) return;
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
        const msg = "Session expired — please sign in again.";
        setPinSessionExpired(true);
        setPinError(msg);
        showToast({ tone: "error", title: "Session expired", message: msg });
        return;
      }
      const body = (await response.json().catch(() => null)) as PinToggleResponse | null;
      if (!response.ok || !body || !body.ok) {
        const msg = "Could not update pinned repositories.";
        setPinError(msg);
        showToast({ tone: "error", title: "Pin update failed", message: msg });
        return;
      }
      setRepos((prev) =>
        prev.map((item) => (item.id === repo.id ? { ...item, pinned: body.pinned } : item))
      );
      showToast({
        tone: "success",
        title: body.pinned ? `Pinned ${repo.slug}` : `Unpinned ${repo.slug}`,
      });
    } catch {
      const msg = "Network error while updating pinned state.";
      setPinError(msg);
      showToast({ tone: "error", title: "Pin update failed", message: msg });
    } finally {
      setPinPendingId(null);
    }
  }

  async function toggleHomePin(repo: OwnerRepoSummary) {
    if (!canFeatureHomepage || !repo.id || homePinPendingId || repo.visibility === "private") {
      return;
    }
    setHomePinPendingId(repo.id);
    setPinError(null);
    setPinSessionExpired(false);
    const nextHomePinned = !repo.homePinned;
    try {
      const response = await fetch(`/auth/api/repositories/${encodeURIComponent(repo.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homePinned: nextHomePinned }),
      });
      if (response.status === 401) {
        const msg = "Session expired — please sign in again.";
        setPinSessionExpired(true);
        setPinError(msg);
        showToast({ tone: "error", title: "Session expired", message: msg });
        return;
      }
      const body = (await response.json().catch(() => null)) as PinToggleResponse | null;
      if (!response.ok || !body || !body.ok) {
        const msg = "Could not update homepage pin state.";
        setPinError(msg);
        showToast({ tone: "error", title: "Homepage pin update failed", message: msg });
        return;
      }
      setRepos((prev) =>
        prev.map((item) =>
          item.id === repo.id ? { ...item, homePinned: Boolean(body.homePinned) } : item
        )
      );
      showToast({
        tone: "success",
        title: body.homePinned ? `${repo.slug} featured on homepage` : `${repo.slug} unfeatured`,
      });
    } catch {
      const msg = "Network error while updating homepage pin state.";
      setPinError(msg);
      showToast({ tone: "error", title: "Homepage pin update failed", message: msg });
    } finally {
      setHomePinPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Profile Underline Tabs */}
      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex items-center gap-1 border-b border-border"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          onClick={() => setTab("overview")}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
            tab === "overview"
              ? "border-fg font-semibold text-fg"
              : "border-transparent font-normal text-fgMuted hover:border-border hover:text-fg"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Overview</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "repositories"}
          onClick={() => setTab("repositories")}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors ${
            tab === "repositories"
              ? "border-fg font-semibold text-fg"
              : "border-transparent font-normal text-fgMuted hover:border-border hover:text-fg"
          }`}
        >
          <FolderGit2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Repositories</span>
          <span className="rounded-none border border-borderSubtle bg-canvas px-1.5 py-0.5 font-mono text-[11px] font-medium text-fgMuted tabular-nums">
            {repos.length}
          </span>
        </button>
      </div>

      {pinError ? (
        <ErrorBanner className="px-3 py-2 text-[12px]">
          <span>{pinError}</span>
          {pinSessionExpired ? (
            <a href="/auth" className="ml-1.5 font-medium underline">
              Sign in
            </a>
          ) : null}
        </ErrorBanner>
      ) : null}

      {/* Overview Tab: .vibtools/profile/README.md + Pinned / Popular Repositories */}
      {tab === "overview" ? (
        <div className="space-y-4">
          {sanitizedReadmeHtml ? (
            <section
              aria-label="Organization profile README"
              className="overflow-hidden rounded-none border border-border bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borderSubtle px-3.5 py-2 text-[12px]">
                <div className="flex min-w-0 items-center gap-1.5 font-mono text-fgBody">
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
                  <a
                    href={editProfileUrl}
                    className="truncate text-fg no-underline hover:text-accent hover:underline"
                  >
                    {owner}/{PROFILE_REPO_SLUG}
                  </a>
                  <span className="text-fgMuted" aria-hidden="true">
                    /
                  </span>
                  <a
                    href={`/${encodeURIComponent(owner)}/${PROFILE_REPO_SLUG}/blob?ref=${encodeURIComponent(profileRef)}&path=${encodeURIComponent(profileReadmePath)}`}
                    className="truncate text-fgMuted no-underline hover:text-fg"
                  >
                    {profileReadmePath}
                  </a>
                  {profileRepoVisibility === "private" ? (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-none border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-400">
                      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                      private
                    </span>
                  ) : null}
                </div>

                {canManageProfile ? (
                  <a
                    href={editProfileUrl}
                    className="inline-flex items-center gap-1 rounded-none border border-border bg-canvas px-2 py-0.5 text-[11px] font-medium text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-dashed border-border bg-surface px-3.5 py-2.5 text-[12px]">
              <div className="flex items-center gap-2 text-fgBody">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
                {hasProfileRepo ? (
                  <span>
                    Your <code className="font-mono text-fg">{PROFILE_REPO_SLUG}</code> repository
                    exists. Add <code className="font-mono text-fg">{PROFILE_README_PATH}</code> to
                    display a custom profile card here.
                  </span>
                ) : (
                  <span>
                    Create a <code className="font-mono text-fg">{PROFILE_REPO_SLUG}</code>{" "}
                    repository with <code className="font-mono text-fg">{PROFILE_README_PATH}</code>{" "}
                    to design a custom profile banner here.
                  </span>
                )}
              </div>
              {hasProfileRepo ? (
                <a
                  href={editProfileUrl}
                  className="inline-flex h-7 items-center gap-1 rounded-none border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
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
                <h2 className="m-0 flex items-center gap-1.5 text-[14px] font-semibold text-fg">
                  {pinnedRepos.length > 0 ? (
                    <Pin className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  ) : (
                    <FolderGit2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  )}
                  <span>{pinnedRepos.length > 0 ? "Pinned" : "Popular repositories"}</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setTab("repositories")}
                  className="text-[12px] font-medium text-accent hover:underline"
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
                      className="flex flex-col justify-between gap-2 rounded-none border border-border bg-surface p-3.5 transition-colors hover:border-fgMuted"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo.slug)}`}
                            className="inline-flex min-w-0 items-center gap-1.5 truncate text-[14px] font-semibold text-fg no-underline hover:text-accent"
                          >
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
                            <span className="truncate">{repo.slug}</span>
                          </a>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {repo.homePinned ? (
                              <span className="rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fg">
                                Homepage
                              </span>
                            ) : null}
                            <span className="rounded-none border border-borderSubtle bg-canvas px-1.5 py-0.5 text-[11px] font-medium capitalize text-fgMuted">
                              {repo.visibility}
                            </span>
                            {canPinRepos && repo.id ? (
                              <button
                                type="button"
                                onClick={() => void togglePin(repo)}
                                disabled={pinPendingId === repo.id}
                                aria-label={repo.pinned ? `Unpin ${repo.slug}` : `Pin ${repo.slug}`}
                                title={repo.pinned ? "Unpin repository" : "Pin repository"}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-none border border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg disabled:opacity-50"
                              >
                                {repo.pinned ? (
                                  <PinOff className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <Pin className="h-3 w-3" aria-hidden="true" />
                                )}
                              </button>
                            ) : null}
                            {canFeatureHomepage && repo.id && repo.visibility === "public" ? (
                              <button
                                type="button"
                                onClick={() => void toggleHomePin(repo)}
                                disabled={homePinPendingId === repo.id}
                                aria-label={
                                  repo.homePinned
                                    ? `Unpin ${repo.slug} from homepage`
                                    : `Pin ${repo.slug} to homepage`
                                }
                                title={
                                  repo.homePinned
                                    ? "Remove from public homepage"
                                    : "Pin to public homepage"
                                }
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-none border transition-colors disabled:opacity-50 ${
                                  repo.homePinned
                                    ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
                                    : "border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg"
                                }`}
                              >
                                <Home className="h-3 w-3" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {repo.description ? (
                          <p className="m-0 mt-1.5 line-clamp-2 text-[13px] leading-[1.45] text-fgBody">
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
            <div className="rounded-none border border-border bg-surface px-4 py-8 text-center">
              <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-fgMuted" aria-hidden="true" />
              <p className="m-0 text-[14px] font-semibold text-fg">No repositories yet</p>
              <p className="m-0 mt-1 text-[13px] text-fgMuted">
                Create or push a repository under @{owner} to get started.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Repositories Tab: Full Filterable Directory */
        <section
          aria-label="Repositories"
          className="overflow-hidden rounded-none border border-border bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borderSubtle px-4 py-2.5">
            <h2 className="m-0 text-[14px] font-semibold text-fg">Repositories</h2>

            {repos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fgMuted"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find a repository..."
                    aria-label="Find a repository"
                    className="h-7 w-48 rounded-none border border-border bg-canvas pr-2.5 pl-8 text-[12px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
                  />
                </div>
                <div className="inline-flex rounded-none border border-border bg-canvas p-0.5 text-[11px]">
                  {(["all", "public", "private"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setVisibilityFilter(option)}
                      className={`rounded-none px-2 py-0.5 capitalize ${
                        visibilityFilter === option
                          ? "bg-surfaceHover font-medium text-fg"
                          : "text-fgMuted hover:text-fg"
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
            <ul className="m-0 list-none divide-y divide-borderSubtle p-0">
              {filteredRepos.map((repo) => {
                const isPrivate = repo.visibility === "private";
                const isProfile = repo.slug === PROFILE_REPO_SLUG;
                return (
                  <li
                    key={repo.slug}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surfaceHover/60"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {isPrivate ? (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-amber-400"
                            aria-label="Private repository"
                          />
                        ) : (
                          <Globe
                            className="h-3.5 w-3.5 shrink-0 text-fgMuted"
                            aria-label="Public repository"
                          />
                        )}
                        <a
                          href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo.slug)}`}
                          className="truncate text-[14px] font-semibold text-fg no-underline hover:text-accent"
                        >
                          <span className="font-normal text-fgMuted">{owner}/</span>
                          <span>{repo.slug}</span>
                        </a>
                        {isProfile ? (
                          <span className="rounded-none border border-borderSubtle bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fgBody">
                            profile
                          </span>
                        ) : null}
                      </div>
                      {repo.description ? (
                        <p className="m-0 mt-1 line-clamp-1 pl-5.5 text-[13px] text-fgBody">
                          {repo.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-[12px] text-fgMuted">
                      {canPinRepos && repo.id ? (
                        <button
                          type="button"
                          onClick={() => void togglePin(repo)}
                          disabled={pinPendingId === repo.id}
                          className={`inline-flex h-6 items-center gap-1 rounded-none border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                            repo.pinned
                              ? "border-border bg-surfaceHover text-fg"
                              : "border-border bg-canvas text-fgBody hover:bg-surfaceHover hover:text-fg"
                          }`}
                        >
                          <Pin className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>{repo.pinned ? "Pinned" : "Pin"}</span>
                        </button>
                      ) : null}
                      {canFeatureHomepage && repo.id ? (
                        <button
                          type="button"
                          onClick={() => void toggleHomePin(repo)}
                          disabled={homePinPendingId === repo.id || repo.visibility === "private"}
                          title={
                            repo.visibility === "private"
                              ? "Make public to pin on the public homepage"
                              : repo.homePinned
                                ? "Remove from public homepage"
                                : "Pin to public homepage"
                          }
                          className={`inline-flex h-6 items-center gap-1 rounded-none border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                            repo.homePinned
                              ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
                              : "border-border bg-canvas text-fgBody hover:bg-surfaceHover hover:text-fg"
                          }`}
                        >
                          <Home className="h-2.5 w-2.5" aria-hidden="true" />
                          <span>{repo.homePinned ? "On Home" : "Homepage"}</span>
                        </button>
                      ) : null}
                      <span className="rounded-none border border-borderSubtle bg-canvas px-1.5 py-0.5 text-[11px] font-medium capitalize text-fgMuted">
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
              <FolderGit2 className="mx-auto mb-2 h-5 w-5 text-fgMuted" aria-hidden="true" />
              <p className="m-0 text-[14px] font-semibold text-fg">
                {repos.length === 0 ? "No repositories yet" : "No matching repositories"}
              </p>
              <p className="m-0 mt-1 text-[13px] text-fgMuted">
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
