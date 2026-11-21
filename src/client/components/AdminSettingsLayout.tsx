import type { ReactNode } from "react";
import {
  FolderGit2,
  KeyRound,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
} from "lucide-react";

export type AdminSettingsSection =
  | "overview"
  | "users"
  | "repositories"
  | "tokens"
  | "settings"
  | "security";

export type AdminNavCounts = {
  users?: number;
  repositories?: number;
  activeTokens?: number;
};

type AdminSettingsLayoutProps = {
  active: AdminSettingsSection;
  counts?: AdminNavCounts;
  children: ReactNode;
};

type NavGroup = {
  heading: string;
  items: ReadonlyArray<{
    key: AdminSettingsSection;
    label: string;
    href: string;
    icon: typeof Shield;
    countKey?: keyof AdminNavCounts;
  }>;
};

const ADMIN_NAV_GROUPS: readonly NavGroup[] = [
  {
    heading: "Overview",
    items: [{ key: "overview", label: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    heading: "Management",
    items: [
      {
        key: "users",
        label: "Users & Accounts",
        href: "/admin/users",
        icon: Users,
        countKey: "users",
      },
      {
        key: "repositories",
        label: "Repositories",
        href: "/admin/repositories",
        icon: FolderGit2,
        countKey: "repositories",
      },
      {
        key: "tokens",
        label: "Access Tokens",
        href: "/admin/tokens",
        icon: KeyRound,
        countKey: "activeTokens",
      },
    ],
  },
  {
    heading: "System",
    items: [
      {
        key: "settings",
        label: "Instance Settings",
        href: "/admin/settings",
        icon: SlidersHorizontal,
      },
      {
        key: "security",
        label: "Security & Policies",
        href: "/admin/security",
        icon: ShieldCheck,
      },
    ],
  },
];

export function AdminSettingsLayout({ active, counts, children }: AdminSettingsLayoutProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[216px_minmax(0,1fr)]">
      {/* Compact Desktop Control Panel Sidebar */}
      <aside
        aria-label="Site administration navigation"
        className="hidden lg:sticky lg:top-16 lg:block"
      >
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/75">
          {/* Control Panel Header */}
          <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent-500/30 bg-accent-500/10 text-accent-600 dark:text-accent-400">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                Control Panel
              </div>
              <div className="truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                Site Administration
              </div>
            </div>
          </div>

          {/* Grouped Navigation */}
          <nav className="space-y-2.5 p-2" aria-label="Control panel sections">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.heading}>
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {group.heading}
                </div>
                <ul className="m-0 list-none space-y-0.5 p-0">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.key;
                    const countValue = item.countKey ? counts?.[item.countKey] : undefined;
                    return (
                      <li key={item.key}>
                        <a
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`group relative flex h-8 items-center justify-between gap-2 rounded-md px-2 text-xs no-underline transition-colors ${
                            isActive
                              ? "bg-accent-500/10 font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
                              : "font-normal text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
                          }`}
                        >
                          {isActive ? (
                            <span
                              className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r bg-accent-600 dark:bg-accent-400"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon
                              className={`h-3.5 w-3.5 shrink-0 ${
                                isActive
                                  ? "text-accent-600 dark:text-accent-400"
                                  : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="truncate">{item.label}</span>
                          </span>
                          {typeof countValue === "number" ? (
                            <span
                              className={`shrink-0 font-mono text-[10px] tabular-nums ${
                                isActive
                                  ? "text-accent-700 dark:text-accent-300"
                                  : "text-zinc-400 dark:text-zinc-500"
                              }`}
                            >
                              {countValue}
                            </span>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Compact Footer Quick Links */}
          <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
            <nav className="space-y-0.5" aria-label="Quick links">
              <a
                href="/user/settings"
                className="flex h-7 items-center gap-2 rounded-md px-2 text-[11px] text-zinc-500 no-underline transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              >
                <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>User Settings</span>
              </a>
              <a
                href="/"
                className="flex h-7 items-center gap-2 rounded-md px-2 text-[11px] text-zinc-500 no-underline transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              >
                <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Back to Repositories</span>
              </a>
            </nav>
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
