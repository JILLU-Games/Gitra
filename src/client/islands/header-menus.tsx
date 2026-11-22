/// <reference lib="dom" />

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronDown,
  FolderGit2,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
  Users,
  X,
} from "lucide-react";

import {
  buildNamespaceProfileHref,
  canAccessAdminPanel,
  canWriteRepositories,
  type DirectoryRole,
} from "@/shared/admin/panel";
import { PROFILE_README_PATH, PROFILE_REPO_SLUG } from "@/shared/slugs";
import { hydrateIsland } from "@/client/hydrate";

export type HeaderMenusIslandProps = {
  handle: string;
  namespaceSlug?: string;
  displayName?: string;
  role: DirectoryRole;
};

type CreateRepoResult =
  | {
      ok: true;
      id: string;
      namespaceSlug: string;
      slug: string;
      visibility: "public" | "private";
      updatedAt: number;
    }
  | { ok: false; reason?: string };

export function HeaderMenusIsland({
  handle,
  namespaceSlug,
  displayName,
  role,
}: HeaderMenusIslandProps) {
  const isAdmin = canAccessAdminPanel(role);
  const canWrite = canWriteRepositories(role);

  const [openMenu, setOpenMenu] = useState<"create" | "user" | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [repoSlug, setRepoSlug] = useState("");
  const [repoDescription, setRepoDescription] = useState("");
  const [repoVisibility, setRepoVisibility] = useState<"public" | "private">("public");
  const [initReadme, setInitReadme] = useState(false);
  const [initProfileReadme, setInitProfileReadme] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const isProfileSlug = repoSlug.trim().toLowerCase() === PROFILE_REPO_SLUG;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        if (!creating) setCreateModalOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [creating]);

  async function handleCreateRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!namespaceSlug || !repoSlug.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const normalizedSlug = repoSlug.trim().toLowerCase();
      const response = await fetch("/auth/api/repositories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug,
          slug: normalizedSlug,
          visibility: repoVisibility,
          description: repoDescription.trim(),
          initializeReadme: normalizedSlug !== PROFILE_REPO_SLUG ? initReadme : false,
          initializeProfileReadme: normalizedSlug === PROFILE_REPO_SLUG ? initProfileReadme : false,
        }),
      });
      const body = (await response.json().catch(() => null)) as CreateRepoResult | null;
      if (!response.ok || !body || !body.ok) {
        const reason = body && !body.ok ? body.reason : `HTTP ${response.status}`;
        setCreateError(
          reason === "slug-taken"
            ? "A repository with that name already exists in this namespace."
            : reason === "invalid-slug"
              ? "Use lowercase letters, numbers, internal hyphens/dots, or .vibtools (1–40 chars)."
              : reason === "viewer-read-only"
                ? "Viewer accounts have read-only access."
                : `Could not create repository (${reason ?? "error"}).`
        );
        return;
      }
      window.location.assign(`/${body.namespaceSlug}/${body.slug}`);
    } catch {
      setCreateError("Network error while creating repository.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className="relative flex items-center gap-1.5 sm:gap-2">
        {/* Gitea-style "+" Create dropdown for members & admins */}
        {canWrite && namespaceSlug ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((cur) => (cur === "create" ? null : "create"))}
              aria-haspopup="menu"
              aria-expanded={openMenu === "create"}
              aria-label="Create new"
              title="Create new repository"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <ChevronDown className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            </button>

            {openMenu === "create" ? (
              <div
                role="menu"
                aria-label="Create menu"
                className="absolute right-0 z-[110] mt-1.5 w-48 rounded-md border border-zinc-200 bg-white py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    setCreateError(null);
                    setRepoSlug("");
                    setRepoDescription("");
                    setInitReadme(false);
                    setCreateModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <FolderGit2
                    className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                  <span>New Repository</span>
                </button>
                {isAdmin ? (
                  <a
                    href="/admin/users"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <Users
                      className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    />
                    <span>Manage Users</span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Gitea-style User profile & Settings / Site Administration dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((cur) => (cur === "user" ? null : "user"))}
            aria-haspopup="menu"
            aria-expanded={openMenu === "user"}
            aria-label="Account menu"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <User className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400" aria-hidden="true" />
            <span className="max-w-[120px] truncate font-mono">{handle}</span>
            <ChevronDown className="h-3 w-3 text-zinc-400" aria-hidden="true" />
          </button>

          {openMenu === "user" ? (
            <div
              role="menu"
              aria-label="User navigation menu"
              className="absolute right-0 z-[110] mt-1.5 w-56 rounded-md border border-zinc-200 bg-white py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <p className="m-0 text-[11px] text-zinc-500 dark:text-zinc-400">Signed in as</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {handle}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {role}
                  </span>
                </div>
                {displayName ? (
                  <p className="m-0 mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {displayName}
                  </p>
                ) : null}
              </div>

              <div className="py-1">
                {namespaceSlug ? (
                  <a
                    href={buildNamespaceProfileHref(namespaceSlug)}
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <User
                      className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    />
                    <span>Public Profile Page</span>
                  </a>
                ) : null}
                <a
                  href="/user/profile"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <SlidersHorizontal
                    className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                  <span>Profile Settings</span>
                </a>
                <a
                  href="/user/account"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <FolderGit2
                    className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                  <span>Account &amp; Repos</span>
                </a>
                <a
                  href="/user/settings"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <Settings
                    className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                  <span>Settings</span>
                </a>
                <a
                  href="/user/settings/security"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <Lock
                    className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                  <span>Password &amp; Security</span>
                </a>
                <a
                  href="/user/settings/tokens"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <KeyRound
                    className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                    aria-hidden="true"
                  />
                  <span>Access Tokens</span>
                </a>
              </div>

              {isAdmin ? (
                <div className="border-t border-zinc-200 py-1 dark:border-zinc-800">
                  <a
                    href="/admin"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 font-medium text-accent-700 no-underline hover:bg-zinc-100 dark:text-accent-300 dark:hover:bg-zinc-800"
                  >
                    <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Site Administration</span>
                  </a>
                  <a
                    href="/admin/users"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <Users
                      className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    />
                    <span>Users &amp; Accounts</span>
                  </a>
                  <a
                    href="/admin/repositories"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <FolderGit2
                      className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    />
                    <span>Admin Repositories</span>
                  </a>
                  <a
                    href="/admin/settings"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-zinc-700 no-underline hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <SlidersHorizontal
                      className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    />
                    <span>Settings Control Panel</span>
                  </a>
                </div>
              ) : null}

              <div className="border-t border-zinc-200 py-1 dark:border-zinc-800">
                <form method="post" action="/auth/sign-out">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <LogOut
                      className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
                      aria-hidden="true"
                    />
                    <span>Sign Out</span>
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Top-bar Create Repository Modal */}
      {createModalOpen && namespaceSlug ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-zinc-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-create-repo-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creating) {
              setCreateModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <h2
                  id="header-create-repo-title"
                  className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  New Repository
                </h2>
                <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Create a Git repository under <span className="font-mono">@{namespaceSlug}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                aria-label="Close modal"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateRepository} className="space-y-3.5 p-4">
              {createError ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
                >
                  {createError}
                </div>
              ) : null}

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label
                    htmlFor="header-repo-slug"
                    className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Repository Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setRepoSlug(PROFILE_REPO_SLUG)}
                    className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    Use {PROFILE_REPO_SLUG}
                  </button>
                </div>
                <div className="flex items-center rounded-md border border-zinc-200 bg-white focus-within:border-accent-500 dark:border-zinc-700 dark:bg-zinc-950">
                  <span className="border-r border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    {namespaceSlug}/
                  </span>
                  <input
                    id="header-repo-slug"
                    type="text"
                    value={repoSlug}
                    onChange={(e) => setRepoSlug(e.target.value)}
                    disabled={creating}
                    placeholder="my-service or .vibtools"
                    autoFocus
                    required
                    className="h-9 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                  />
                </div>
                <p className="m-0 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Lowercase letters, digits, hyphens/dots, or{" "}
                  <code className="font-mono">{PROFILE_REPO_SLUG}</code> for namespace profile
                  README.
                </p>
              </div>

              <div>
                <label
                  htmlFor="header-repo-description"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Description <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  id="header-repo-description"
                  type="text"
                  value={repoDescription}
                  onChange={(e) => setRepoDescription(e.target.value)}
                  disabled={creating}
                  maxLength={200}
                  placeholder="Short description of this repository"
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              {isProfileSlug ? (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-accent-500/30 bg-accent-500/5 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={initProfileReadme}
                    onChange={(event) => setInitProfileReadme(event.target.checked)}
                    disabled={creating}
                    className="mt-0.5"
                  />
                  <span>
                    Initialize <code className="font-mono">{PROFILE_README_PATH}</code> starter
                    template for your namespace profile page.
                  </span>
                </label>
              ) : (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={initReadme}
                    onChange={(event) => setInitReadme(event.target.checked)}
                    disabled={creating}
                    className="mt-0.5"
                  />
                  <span>
                    Initialize repository with a <code className="font-mono">README.md</code> file
                  </span>
                </label>
              )}

              <div>
                <label
                  htmlFor="header-repo-visibility"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Visibility
                </label>
                <select
                  id="header-repo-visibility"
                  value={repoVisibility}
                  onChange={(e) =>
                    setRepoVisibility(e.target.value === "private" ? "private" : "public")
                  }
                  disabled={creating}
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="public">
                    Public — visible to everyone on homepage &amp; Explore
                  </option>
                  <option value="private">
                    Private — only namespace members can view &amp; clone
                  </option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                  className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !repoSlug.trim()}
                  className="inline-flex h-8 items-center rounded-md border border-accent-600 bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Repository"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function initHeaderMenusIsland() {
  hydrateIsland<HeaderMenusIslandProps>("header-menus", HeaderMenusIsland);
}
