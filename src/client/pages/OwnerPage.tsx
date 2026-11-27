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
  homePinned?: boolean;
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
  canPinRepos?: boolean;
  canFeatureHomepage?: boolean;
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
  canPinRepos = canManageProfile,
  canFeatureHomepage = false,
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
    canPinRepos,
    canFeatureHomepage,
    hasProfileRepo,
    profileRepoVisibility,
    profileReadmeHtml,
    profileReadmePath: resolvedProfileReadmePath,
    profileRef,
    repos,
  };

  return (
    <div className="space-y-4">
      {/* Compact Namespace Header */}
      <header className="flex flex-col gap-3 rounded-none border border-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-none border border-border bg-canvas text-[16px] font-semibold text-fg"
            aria-hidden="true"
          >
            {avatarInitial}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 truncate text-[18px] font-semibold tracking-tight text-fg">
                {resolvedName}
              </h1>
              <span className="font-mono text-[12px] text-fgMuted">@{owner}</span>
              {role ? (
                <span className="rounded-none border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-fgMuted">
                  {role}
                </span>
              ) : null}
            </div>

            {bio ? <p className="m-0 text-[13px] leading-relaxed text-fgBody">{bio}</p> : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[12px] text-fgMuted">
              <span>
                <span className="font-medium text-fg tabular-nums">{repos.length}</span>{" "}
                {repos.length === 1 ? "repository" : "repositories"}
                <span className="mx-1.5 text-fgMuted" aria-hidden="true">
                  ·
                </span>
                <span className="font-medium text-fg tabular-nums">{publicCount}</span> public
              </span>

              {location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
                  <span>{location}</span>
                </span>
              ) : null}

              {website ? (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent no-underline hover:underline"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
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
