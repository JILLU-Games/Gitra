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
        {/* "+" Create dropdown for members & admins */}
        {canWrite && namespaceSlug ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((cur) => (cur === "create" ? null : "create"))}
              aria-haspopup="menu"
              aria-expanded={openMenu === "create"}
              aria-label="Create new"
              title="Create new repository"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-canvas px-2 text-[12px] font-medium text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <ChevronDown className="h-3 w-3 text-fgMuted" aria-hidden="true" />
            </button>

            {openMenu === "create" ? (
              <div
                role="menu"
                aria-label="Create menu"
                className="absolute right-0 z-[110] mt-1.5 w-48 rounded-md border border-border bg-surface py-1 text-[12px]"
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-fgBody hover:bg-surfaceHover hover:text-fg"
                >
                  <FolderGit2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>New Repository</span>
                </button>
                {isAdmin ? (
                  <a
                    href="/admin/users"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    <Users className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                    <span>Manage Users</span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* User profile & Settings / Site Administration dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((cur) => (cur === "user" ? null : "user"))}
            aria-haspopup="menu"
            aria-expanded={openMenu === "user"}
            aria-label="Account menu"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-surfaceHover"
          >
            <User className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span className="max-w-[120px] truncate font-mono">{handle}</span>
            <ChevronDown className="h-3 w-3 text-fgMuted" aria-hidden="true" />
          </button>

          {openMenu === "user" ? (
            <div
              role="menu"
              aria-label="User navigation menu"
              className="absolute right-0 z-[110] mt-1.5 w-56 rounded-md border border-border bg-surface py-1 text-[12px]"
            >
              <div className="border-b border-borderSubtle px-3 py-2">
                <p className="m-0 text-[11px] text-fgMuted">Signed in as</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate font-mono font-semibold text-fg">{handle}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fgMuted">
                    {role}
                  </span>
                </div>
                {displayName ? (
                  <p className="m-0 mt-0.5 truncate text-[11px] text-fgMuted">{displayName}</p>
                ) : null}
              </div>

              <div className="py-1">
                {namespaceSlug ? (
                  <a
                    href={buildNamespaceProfileHref(namespaceSlug)}
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    <User className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                    <span>Public Profile Page</span>
                  </a>
                ) : null}
                <a
                  href="/user/profile"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Profile Settings</span>
                </a>
                <a
                  href="/user/account"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                >
                  <FolderGit2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Account &amp; Repos</span>
                </a>
                <a
                  href="/user/settings"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                >
                  <Settings className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Settings</span>
                </a>
                <a
                  href="/user/settings/security"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                >
                  <Lock className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Password &amp; Security</span>
                </a>
                <a
                  href="/user/settings/tokens"
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                >
                  <KeyRound className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                  <span>Access Tokens</span>
                </a>
              </div>

              {isAdmin ? (
                <div className="border-t border-borderSubtle py-1">
                  <a
                    href="/admin"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 font-medium text-fg no-underline hover:bg-surfaceHover"
                  >
                    <Shield className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>Site Administration</span>
                  </a>
                  <a
                    href="/admin/users"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    <Users className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                    <span>Users &amp; Accounts</span>
                  </a>
                  <a
                    href="/admin/repositories"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    <FolderGit2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                    <span>Admin Repositories</span>
                  </a>
                  <a
                    href="/admin/settings"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
                    <span>Settings Control Panel</span>
                  </a>
                </div>
              ) : null}

              <div className="border-t border-borderSubtle py-1">
                <form method="post" action="/auth/sign-out">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-fgBody hover:bg-surfaceHover hover:text-fg"
                  >
                    <LogOut className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
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
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-create-repo-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creating) {
              setCreateModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-borderSubtle px-4 py-3">
              <div>
                <h2 id="header-create-repo-title" className="m-0 text-[14px] font-semibold text-fg">
                  New Repository
                </h2>
                <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
                  Create a Git repository under <span className="font-mono">@{namespaceSlug}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                aria-label="Close modal"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateRepository} className="space-y-3.5 p-4">
              {createError ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
                >
                  {createError}
                </div>
              ) : null}

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label
                    htmlFor="header-repo-slug"
                    className="block text-[12px] font-medium text-fg"
                  >
                    Repository Name
                  </label>
                  <button
                    type="button"
                    onClick={() => setRepoSlug(PROFILE_REPO_SLUG)}
                    className="rounded border border-border bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fgBody hover:bg-surfaceHover hover:text-fg"
                  >
                    Use {PROFILE_REPO_SLUG}
                  </button>
                </div>
                <div className="flex items-center rounded-md border border-border bg-canvas focus-within:border-fgMuted">
                  <span className="border-r border-border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-fgMuted">
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
                    className="h-8 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:outline-none"
                  />
                </div>
                <p className="m-0 mt-1 text-[12px] text-fgMuted">
                  Lowercase letters, digits, hyphens/dots, or{" "}
                  <code className="font-mono text-fgBody">{PROFILE_REPO_SLUG}</code> for namespace
                  profile README.
                </p>
              </div>

              <div>
                <label
                  htmlFor="header-repo-description"
                  className="mb-1 block text-[12px] font-medium text-fg"
                >
                  Description <span className="font-normal text-fgMuted">(optional)</span>
                </label>
                <input
                  id="header-repo-description"
                  type="text"
                  value={repoDescription}
                  onChange={(e) => setRepoDescription(e.target.value)}
                  disabled={creating}
                  maxLength={200}
                  placeholder="Short description of this repository"
                  className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
                />
              </div>

              {isProfileSlug ? (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-canvas px-3 py-2 text-[12px] text-fgBody">
                  <input
                    type="checkbox"
                    checked={initProfileReadme}
                    onChange={(event) => setInitProfileReadme(event.target.checked)}
                    disabled={creating}
                    className="mt-0.5"
                  />
                  <span>
                    Initialize <code className="font-mono text-fg">{PROFILE_README_PATH}</code>{" "}
                    starter template for your namespace profile page.
                  </span>
                </label>
              ) : (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-canvas px-3 py-2 text-[12px] text-fgBody">
                  <input
                    type="checkbox"
                    checked={initReadme}
                    onChange={(event) => setInitReadme(event.target.checked)}
                    disabled={creating}
                    className="mt-0.5"
                  />
                  <span>
                    Initialize repository with a{" "}
                    <code className="font-mono text-fg">README.md</code> file
                  </span>
                </label>
              )}

              <div>
                <label
                  htmlFor="header-repo-visibility"
                  className="mb-1 block text-[12px] font-medium text-fg"
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
                  className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 text-[12px] text-fg focus:border-fgMuted focus:outline-none"
                >
                  <option value="public">
                    Public — visible to everyone on homepage &amp; Explore
                  </option>
                  <option value="private">
                    Private — only namespace members can view &amp; clone
                  </option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-borderSubtle pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !repoSlug.trim()}
                  className="inline-flex h-8 items-center rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas hover:bg-fgHover disabled:opacity-50"
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
