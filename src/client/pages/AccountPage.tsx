import { ArrowUpRight, FolderGit2, KeyRound, Lock, Shield, ShieldCheck } from "lucide-react";

import {
  canAccessAdminPanel,
  canWriteRepositories,
  type DirectoryRole,
} from "@/shared/admin/panel";
import { EmptyState } from "@/client/components/ui";
import {
  UserSettingsLayout,
  type UserSettingsSection,
} from "@/client/components/UserSettingsLayout";
import { ChangePasswordIsland } from "@/client/islands/change-password";
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
  viewerRole = "member",
  isPrimaryAdmin = false,
  hasPassword = false,
  activeSection = "all",
  namespaces,
  repositories,
  tokens,
}: AccountPageProps) {
  const handle = primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "Identity not yet claimed";
  const isAdmin = canAccessAdminPanel(viewerRole);
  const readOnly = !canWriteRepositories(viewerRole);
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
    <UserSettingsLayout active={activeSection}>
      <div className="space-y-6">
        {/* Section Header */}
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {meta.title}
            </h1>
            <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">{meta.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {primaryNamespaceSlug ? (
              <a
                href={`/${primaryNamespaceSlug}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <span>Public page</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {isAdmin ? (
              <a
                href="/admin"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-500/35 bg-accent-500/10 px-2.5 text-xs font-medium text-accent-700 no-underline hover:bg-accent-500/15 dark:text-accent-300"
              >
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Site Administration</span>
              </a>
            ) : null}
          </div>
        </header>

        {/* Identity / Profile Summary Card */}
        {showProfileCard ? (
          <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
              Identity
            </div>
            <dl className="m-0 grid grid-cols-1 divide-y divide-zinc-200 text-xs sm:grid-cols-2 sm:divide-y-0 dark:divide-zinc-800">
              <div className="px-4 py-3 sm:border-r sm:border-b sm:border-zinc-200 dark:sm:border-zinc-800">
                <dt className="text-zinc-500 dark:text-zinc-400">Username / Handle</dt>
                <dd className="m-0 mt-1 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {handle}
                </dd>
              </div>
              <div className="px-4 py-3 sm:border-b sm:border-zinc-200 dark:sm:border-zinc-800">
                <dt className="text-zinc-500 dark:text-zinc-400">Display Name</dt>
                <dd className="m-0 mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {displayName || handle}
                </dd>
              </div>
              <div className="px-4 py-3 sm:border-r sm:border-zinc-200 dark:sm:border-zinc-800">
                <dt className="text-zinc-500 dark:text-zinc-400">Role</dt>
                <dd className="m-0 mt-1 font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {viewerRole}
                </dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Account ID</dt>
                <dd
                  className="m-0 mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400"
                  title={userId}
                >
                  {truncateUserId(userId)}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {/* Settings hub quick cards */}
        {showSettingsShortcuts ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <a
              href="/user/account"
              className="block rounded-lg border border-zinc-200 bg-white p-3.5 no-underline transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-center justify-between text-xs font-medium text-zinc-900 dark:text-zinc-100">
                <span>Repositories</span>
                <FolderGit2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              </div>
              <p className="m-0 mt-1 font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {repositories.length} owned
              </p>
            </a>
            <a
              href="/user/settings/tokens"
              className="block rounded-lg border border-zinc-200 bg-white p-3.5 no-underline transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-center justify-between text-xs font-medium text-zinc-900 dark:text-zinc-100">
                <span>Access Tokens</span>
                <KeyRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              </div>
              <p className="m-0 mt-1 font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {tokens.filter((t) => !t.revokedAt).length} active
              </p>
            </a>
            <a
              href="/user/settings/security"
              className="block rounded-lg border border-zinc-200 bg-white p-3.5 no-underline transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-center justify-between text-xs font-medium text-zinc-900 dark:text-zinc-100">
                <span>Security</span>
                <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              </div>
              <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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
            <h2 className="m-0 mb-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Namespaces
            </h2>
            {namespaces.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5 text-zinc-400" aria-hidden="true" />}
                title="No namespace yet"
                detail="Sign in as an administrator to claim your default namespace."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {namespaces.map((ns) => (
                  <a
                    key={ns.id}
                    href={`/${ns.slug}`}
                    className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2.5 py-1 font-mono text-xs text-zinc-700 no-underline transition-colors hover:border-accent-500/40 hover:text-accent-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-accent-400"
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
            <h2 className="m-0 mb-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Password &amp; Security
            </h2>
            <IslandHost name="change-password" props={{ isPrimaryAdmin, hasPassword }}>
              <ChangePasswordIsland isPrimaryAdmin={isPrimaryAdmin} hasPassword={hasPassword} />
            </IslandHost>
          </section>
        ) : null}

        {/* Repositories */}
        {showRepositories ? (
          <section id="repositories" className="scroll-mt-16">
            <h2 className="m-0 mb-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Repositories
            </h2>
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
            <h2 className="m-0 mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Tokens
            </h2>
            <p className="m-0 mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Personal access tokens scope to a namespace or a single repo. The plaintext is shown
              only once at creation.
            </p>
            <IslandHost
              name="tokens"
              props={{ primaryNamespaceSlug, repositories, tokens, readOnly }}
            >
              <TokensIsland
                primaryNamespaceSlug={primaryNamespaceSlug}
                repositories={repositories}
                tokens={tokens}
                readOnly={readOnly}
              />
            </IslandHost>
          </section>
        ) : null}
      </div>
    </UserSettingsLayout>
  );
}
