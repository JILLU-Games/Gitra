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
  children: ReactNode;
};

const USER_SETTINGS_NAV: ReadonlyArray<{
  key: Exclude<UserSettingsSection, "all">;
  label: string;
  href: string;
  icon: typeof User;
}> = [
  { key: "profile", label: "Profile", href: "/user/profile", icon: User },
  { key: "account", label: "Account", href: "/user/account", icon: FolderGit2 },
  { key: "settings", label: "Settings", href: "/user/settings", icon: Settings },
  { key: "security", label: "Security", href: "/user/settings/security", icon: Lock },
  { key: "tokens", label: "Access Tokens", href: "/user/settings/tokens", icon: KeyRound },
];

export function UserSettingsLayout({ active, children }: UserSettingsLayoutProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside aria-label="User settings navigation">
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200">
            User Settings
          </div>
          <nav className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {USER_SETTINGS_NAV.map((item) => {
              const Icon = item.icon;
              const isActive =
                active === item.key || (active === "all" && item.key === "account");
              return (
                <a
                  key={item.key}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium no-underline transition-colors ${
                    isActive
                      ? "bg-accent-500/10 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
                      : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive
                        ? "text-accent-600 dark:text-accent-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
