import type { ReactNode } from "react";
import { FolderGit2, KeyRound, Lock, Settings, User } from "lucide-react";

export type UserSettingsSection =
  | "profile"
  | "account"
  | "settings"
  | "security"
  | "tokens"
  | "all";

type UserSettingsLayoutProps = {
  active: UserSettingsSection;
  handle?: string;
  children: ReactNode;
};

type UserNavGroup = {
  heading: string;
  items: ReadonlyArray<{
    key: Exclude<UserSettingsSection, "all">;
    label: string;
    href: string;
    icon: typeof User;
  }>;
};

const USER_SETTINGS_GROUPS: readonly UserNavGroup[] = [
  {
    heading: "Account",
    items: [
      { key: "profile", label: "Profile", href: "/user/profile", icon: User },
      { key: "account", label: "Account & Repos", href: "/user/account", icon: FolderGit2 },
      { key: "settings", label: "Settings", href: "/user/settings", icon: Settings },
    ],
  },
  {
    heading: "Access & Security",
    items: [
      { key: "security", label: "Password & Security", href: "/user/settings/security", icon: Lock },
      { key: "tokens", label: "Access Tokens", href: "/user/settings/tokens", icon: KeyRound },
    ],
  },
];

const MOBILE_USER_NAV = USER_SETTINGS_GROUPS.flatMap((g) => g.items);

export function UserSettingsLayout({ active, handle, children }: UserSettingsLayoutProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[216px_minmax(0,1fr)]">
      {/* Mobile Compact Horizontal Nav */}
      <nav
        aria-label="User settings mobile navigation"
        className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 pb-2.5 lg:hidden dark:border-zinc-800"
      >
        {MOBILE_USER_NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            active === item.key || (active === "all" && item.key === "account");
          return (
            <a
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium no-underline transition-colors ${
                isActive
                  ? "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Compact Desktop User Settings Sidebar */}
      <aside
        aria-label="User settings navigation"
        className="hidden lg:sticky lg:top-16 lg:block"
      >
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/75">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                User Settings
              </div>
              {handle ? (
                <div className="truncate font-mono text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                  {handle}
                </div>
              ) : null}
            </div>
          </div>

          <nav className="space-y-2.5 p-2" aria-label="User settings sections">
            {USER_SETTINGS_GROUPS.map((group) => (
              <div key={group.heading}>
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {group.heading}
                </div>
                <ul className="m-0 list-none space-y-0.5 p-0">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      active === item.key || (active === "all" && item.key === "account");
                    return (
                      <li key={item.key}>
                        <a
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          className={`group relative flex h-8 items-center gap-2 rounded-md px-2 text-xs no-underline transition-colors ${
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
                          <Icon
                            className={`h-3.5 w-3.5 shrink-0 ${
                              isActive
                                ? "text-accent-600 dark:text-accent-400"
                                : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
            <a
              href="/"
              className="flex h-7 items-center gap-2 rounded-md px-2 text-[11px] text-zinc-500 no-underline transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
            >
              <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Back to Repositories</span>
            </a>
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
