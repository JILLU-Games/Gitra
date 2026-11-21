import type { ReactNode } from "react";
import { FolderGit2, Shield, SlidersHorizontal, User, Users } from "lucide-react";

export type AdminSettingsSection = "overview" | "users" | "settings";

type AdminSettingsLayoutProps = {
  active: AdminSettingsSection;
  children: ReactNode;
};

const ADMIN_NAV: ReadonlyArray<{
  key: AdminSettingsSection;
  label: string;
  href: string;
  icon: typeof Shield;
}> = [
  { key: "overview", label: "Control Panel", href: "/admin", icon: Shield },
  { key: "users", label: "Users", href: "/admin/users", icon: Users },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: SlidersHorizontal },
];

export function AdminSettingsLayout({ active, children }: AdminSettingsLayoutProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside aria-label="Site administration navigation" className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200">
            Site Administration
          </div>
          <nav className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key;
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

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <nav className="divide-y divide-zinc-200 dark:divide-zinc-800" aria-label="Quick links">
            <a
              href="/user/settings"
              className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-600 no-underline hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            >
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>User Settings</span>
            </a>
            <a
              href="/"
              className="flex items-center gap-2.5 px-3.5 py-2 text-xs text-zinc-600 no-underline hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            >
              <FolderGit2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Repositories</span>
            </a>
          </nav>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
