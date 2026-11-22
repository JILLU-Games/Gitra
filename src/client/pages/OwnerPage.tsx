import { Link2, MapPin, Pencil } from "lucide-react";

import { renderMarkdownToHtml } from "@/client/components/MarkdownContent";
import { OwnerProfileActionIsland, OwnerReposIsland } from "@/client/islands/owner-profile";
import { IslandHost } from "@/client/server/IslandHost";
import type { DirectoryRole } from "@/shared/admin/panel";
import { PROFILE_README_PATH, PROFILE_REPO_SLUG } from "@/shared/slugs";

export type OwnerPageRepo = {
  id?: string;
  slug: string;
  visibility: "public" | "private";
  description?: string;
  pinned?: boolean;
  updatedAt?: number;
};

export type OwnerPageProps = {
  owner: string;
  displayName?: string;
  role?: DirectoryRole;
  bio?: string;
  location?: string;
  website?: string;
  canManageProfile?: boolean;
  hasProfileRepo?: boolean;
  profileRepoVisibility?: "public" | "private";
  profileReadmeMd?: string;
  profileReadmePath?: string;
  profileRef?: string;
  repos: OwnerPageRepo[];
};

function formatWebsiteLabel(rawUrl: string): string {
  return rawUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function OwnerPage({
  owner,
  displayName,
  role,
  bio,
  location,
  website,
  canManageProfile = false,
  hasProfileRepo = false,
  profileRepoVisibility,
  profileReadmeMd,
  profileReadmePath,
  profileRef = "main",
  repos,
}: OwnerPageProps) {
  const publicCount = repos.filter((repo) => repo.visibility === "public").length;
  const resolvedName = displayName || owner;
  const avatarInitial = resolvedName.charAt(0).toUpperCase() || owner.charAt(0).toUpperCase();
  const resolvedProfileReadmePath = profileReadmePath || PROFILE_README_PATH;
  const profileBaseDir = resolvedProfileReadmePath.includes("/")
    ? resolvedProfileReadmePath.slice(0, resolvedProfileReadmePath.lastIndexOf("/"))
    : "profile";
  const profileReadmeHtml = profileReadmeMd
    ? renderMarkdownToHtml(profileReadmeMd, {
        owner,
        repo: PROFILE_REPO_SLUG,
        ref: profileRef,
        baseDir: profileBaseDir,
      })
    : "";

  const reposIslandProps = {
    owner,
    canManageProfile,
    hasProfileRepo,
    profileRepoVisibility,
    profileReadmeHtml,
    profileReadmePath: resolvedProfileReadmePath,
    profileRef,
    repos,
  };

  return (
    <div className="space-y-4">
      {/* Compact GitHub/Gitea-style Namespace Header */}
      <header className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-lg font-semibold text-accent-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-accent-400"
            aria-hidden="true"
          >
            {avatarInitial}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 truncate text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                {resolvedName}
              </h1>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">@{owner}</span>
              {role ? (
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {role}
                </span>
              ) : null}
            </div>

            {bio ? (
              <p className="m-0 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                {bio}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">
                  {repos.length}
                </span>{" "}
                {repos.length === 1 ? "repository" : "repositories"}
                <span className="mx-1.5 text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                  ·
                </span>
                <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">
                  {publicCount}
                </span>{" "}
                public
              </span>

              {location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                  <span>{location}</span>
                </span>
              ) : null}

              {website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent-600 no-underline hover:underline dark:text-accent-400"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{formatWebsiteLabel(website)}</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {canManageProfile ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a
              href="/user/profile"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              <span>Edit profile</span>
            </a>
            <IslandHost
              name="owner-profile-action"
              props={{ owner, canManageProfile, hasProfileRepo }}
            >
              <OwnerProfileActionIsland
                owner={owner}
                canManageProfile={canManageProfile}
                hasProfileRepo={hasProfileRepo}
              />
            </IslandHost>
          </div>
        ) : null}
      </header>

      {/* Profile Overview (.vibtools README + Pinned) and Filterable Repositories Tabs */}
      <IslandHost name="owner-repos" props={reposIslandProps}>
        <OwnerReposIsland {...reposIslandProps} />
      </IslandHost>
    </div>
  );
}
