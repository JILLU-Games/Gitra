import { ArrowUpRight, FolderGit2, KeyRound, Lock, ShieldCheck } from "lucide-react";

import {
  buildNamespaceProfileHref,
  canIssueGlobalPat,
  canWriteRepositories,
  type DirectoryRole,
} from "@/shared/admin/panel";
import { EmptyState } from "@/client/components/ui";
import {
  UserSettingsLayout,
  type UserSettingsSection,
} from "@/client/components/UserSettingsLayout";
import { ChangePasswordIsland } from "@/client/islands/change-password";
import { ProfileSettingsIsland } from "@/client/islands/profile-settings";
import { RepositoriesIsland } from "@/client/islands/repositories";
import { TokensIsland, type TokensIslandSummary } from "@/client/islands/tokens";
import { IslandHost } from "@/client/server/IslandHost";

export type AccountNamespace = {
  id: string;
  slug: string;
};

export type AccountRepository = {
  id: string;
  slug: string;
  namespaceSlug: string;
  visibility: "public" | "private";
  updatedAt: number;
};

export type AccountPageProps = {
  userId: string;
  primaryNamespaceSlug?: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  viewerRole?: DirectoryRole;
  isPrimaryAdmin?: boolean;
  hasPassword?: boolean;
  activeSection?: UserSettingsSection;
  namespaces: AccountNamespace[];
  repositories: AccountRepository[];
  tokens: TokensIslandSummary[];
};

function truncateUserId(userId: string): string {
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

const SECTION_META: Record<UserSettingsSection, { title: string; subtitle: string }> = {
  profile: {
    title: "Public Profile",
    subtitle: "Review your handle, role, and namespace identity across repositories.",
  },
  account: {
    title: "Account & Repositories",
    subtitle: "Manage your namespaces and repositories owned under your account.",
  },
  settings: {
    title: "User Settings",
    subtitle: "Manage your profile, password security, and Git personal access tokens.",
  },
  security: {
    title: "Password & Security",
    subtitle: "Update your sign-in password and review credential protection.",
  },
  tokens: {
    title: "Personal Access Tokens",
    subtitle: "Generate scoped tokens for git clone, git pull, and git push over HTTPS.",
  },
  all: {
    title: "Account & Identity",
    subtitle: "Manage your identity, password security, repositories, and personal access tokens.",
  },
};

export function AccountPage({
  userId,
  primaryNamespaceSlug,
  displayName,
  bio = "",
  location = "",
  website = "",
  viewerRole = "member",
  isPrimaryAdmin = false,
  hasPassword = false,
  activeSection = "all",
  namespaces,
  repositories,
  tokens,
}: AccountPageProps) {
  const handle = primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "Identity not yet claimed";
  const readOnly = !canWriteRepositories(viewerRole);
  const allowGlobalScope = canIssueGlobalPat(viewerRole);
  const meta = SECTION_META[activeSection];

  const showProfileCard =
    activeSection === "profile" || activeSection === "settings" || activeSection === "all";
  const showNamespaces =
    activeSection === "profile" || activeSection === "account" || activeSection === "all";
  const showSecurity =
    activeSection === "security" || activeSection === "settings" || activeSection === "all";
  const showRepositories = activeSection === "account" || activeSection === "all";
  const showTokens = activeSection === "tokens" || activeSection === "all";
  const showSettingsShortcuts = activeSection === "settings";

  return (
    <UserSettingsLayout
      active={activeSection}
      handle={primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : undefined}
    >
      <div className="space-y-4">
        {/* Section Header */}
        <header className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">{meta.title}</h1>
            <p className="m-0 mt-0.5 text-[12px] text-fgMuted">{meta.subtitle}</p>
          </div>

          {primaryNamespaceSlug ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <a
                href={buildNamespaceProfileHref(primaryNamespaceSlug)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-canvas px-3 text-[12px] font-medium whitespace-nowrap text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
              >
                <span>Public profile</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          ) : null}
        </header>

        {/* Identity / Profile Summary Card */}
        {showProfileCard ? (
          <section className="rounded-md border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5 text-[13px] font-semibold text-fg">
              Identity
            </div>
            <dl className="m-0 grid grid-cols-1 divide-y divide-borderSubtle text-[12px] sm:grid-cols-2 sm:divide-y-0">
              <div className="px-4 py-3 sm:border-r sm:border-b sm:border-borderSubtle">
                <dt className="text-fgMuted">Username / Handle</dt>
                <dd className="m-0 mt-1 font-mono text-[13px] font-semibold text-fg">{handle}</dd>
              </div>
              <div className="px-4 py-3 sm:border-b sm:border-borderSubtle">
                <dt className="text-fgMuted">Display Name</dt>
                <dd className="m-0 mt-1 text-[13px] font-medium text-fg">
                  {displayName || handle}
                </dd>
              </div>
              <div className="px-4 py-3 sm:border-r sm:border-borderSubtle">
                <dt className="text-fgMuted">Role</dt>
                <dd className="m-0 mt-1 text-[12px] font-medium capitalize text-fgBody">
                  {viewerRole}
                </dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-fgMuted">Account ID</dt>
                <dd className="m-0 mt-1 font-mono text-[12px] text-fgBody" title={userId}>
                  {truncateUserId(userId)}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {/* Public Profile Editor (Display Name, Bio, Location, Website) */}
        {primaryNamespaceSlug &&
        (activeSection === "profile" || activeSection === "settings" || activeSection === "all") ? (
          <IslandHost
            name="profile-settings"
            props={{
              namespaceSlug: primaryNamespaceSlug,
              initialDisplayName: displayName || "",
              initialBio: bio,
              initialLocation: location,
              initialWebsite: website,
            }}
          >
            <ProfileSettingsIsland
              namespaceSlug={primaryNamespaceSlug}
              initialDisplayName={displayName || ""}
              initialBio={bio}
              initialLocation={location}
              initialWebsite={website}
            />
          </IslandHost>
        ) : null}

        {/* Settings hub quick cards */}
        {showSettingsShortcuts ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <a
              href="/user/account"
              className="block rounded-md border border-border bg-surface p-3.5 no-underline transition-colors hover:bg-surfaceHover/50"
            >
              <div className="flex items-center justify-between text-[13px] font-medium text-fg">
                <span>Repositories</span>
                <FolderGit2 className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
              </div>
              <p className="m-0 mt-1 text-[12px] text-fgMuted tabular-nums">
                {repositories.length} owned
              </p>
            </a>
            <a
              href="/user/settings/tokens"
              className="block rounded-md border border-border bg-surface p-3.5 no-underline transition-colors hover:bg-surfaceHover/50"
            >
              <div className="flex items-center justify-between text-[13px] font-medium text-fg">
                <span>Access Tokens</span>
                <KeyRound className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
              </div>
              <p className="m-0 mt-1 text-[12px] text-fgMuted tabular-nums">
                {tokens.filter((t) => !t.revokedAt).length} active
              </p>
            </a>
            <a
              href="/user/settings/security"
              className="block rounded-md border border-border bg-surface p-3.5 no-underline transition-colors hover:bg-surfaceHover/50"
            >
              <div className="flex items-center justify-between text-[13px] font-medium text-fg">
                <span>Security</span>
                <Lock className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
              </div>
              <p className="m-0 mt-1 text-[12px] text-fgMuted">
                {isPrimaryAdmin
                  ? "Env / Demo config"
                  : hasPassword
                    ? "Password enabled"
                    : "No password set"}
              </p>
            </a>
          </div>
        ) : null}

        {/* Namespaces */}
        {showNamespaces ? (
          <section>
            <h2 className="m-0 mb-2 text-[13px] font-semibold text-fg">Namespaces</h2>
            {namespaces.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-4 w-4 text-fgMuted" aria-hidden="true" />}
                title="No namespace yet"
                detail="Sign in as an administrator to claim your default namespace."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {namespaces.map((ns) => (
                  <a
                    key={ns.id}
                    href={buildNamespaceProfileHref(ns.slug)}
                    className="inline-flex items-center rounded border border-border bg-canvas px-2.5 py-1 font-mono text-[12px] text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
                  >
                    @{ns.slug}
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Password & Security */}
        {showSecurity ? (
          <section id="security" className="scroll-mt-16">
            {activeSection !== "security" ? (
              <h2 className="m-0 mb-2 text-[13px] font-semibold text-fg">
                Password &amp; Security
              </h2>
            ) : null}
            <IslandHost name="change-password" props={{ isPrimaryAdmin, hasPassword }}>
              <ChangePasswordIsland isPrimaryAdmin={isPrimaryAdmin} hasPassword={hasPassword} />
            </IslandHost>
          </section>
        ) : null}

        {/* Repositories */}
        {showRepositories ? (
          <section id="repositories" className="scroll-mt-16">
            <h2 className="m-0 mb-2 text-[13px] font-semibold text-fg">Repositories</h2>
            <IslandHost
              name="repositories"
              props={{ primaryNamespaceSlug, repositories, readOnly }}
            >
              <RepositoriesIsland
                primaryNamespaceSlug={primaryNamespaceSlug}
                repositories={repositories}
                readOnly={readOnly}
              />
            </IslandHost>
          </section>
        ) : null}

        {/* Tokens */}
        {showTokens ? (
          <section id="tokens" className="scroll-mt-16">
            {activeSection === "all" ? (
              <>
                <h2 className="m-0 mb-1 text-[13px] font-semibold text-fg">Tokens</h2>
                <p className="m-0 mb-3 text-[12px] text-fgMuted">
                  Personal access tokens scope to a namespace or a single repo. The plaintext is
                  shown only once at creation.
                </p>
              </>
            ) : null}
            <IslandHost
              name="tokens"
              props={{ primaryNamespaceSlug, repositories, tokens, readOnly, allowGlobalScope }}
            >
              <TokensIsland
                primaryNamespaceSlug={primaryNamespaceSlug}
                repositories={repositories}
                tokens={tokens}
                readOnly={readOnly}
                allowGlobalScope={allowGlobalScope}
              />
            </IslandHost>
          </section>
        ) : null}
      </div>
    </UserSettingsLayout>
  );
}
