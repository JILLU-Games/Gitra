import {
  FolderGit2,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import type { AdminNavCounts, AdminSettingsSection } from "./AdminSettingsLayout";

type AdminSubNavProps = {
  active: AdminSettingsSection;
  counts?: AdminNavCounts;
};

const MOBILE_ITEMS: ReadonlyArray<{
  key: AdminSettingsSection;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  countKey?: keyof AdminNavCounts;
}> = [
  { key: "overview", label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { key: "users", label: "Users", href: "/admin/users", icon: Users, countKey: "users" },
  {
    key: "repositories",
    label: "Repositories",
    href: "/admin/repositories",
    icon: FolderGit2,
    countKey: "repositories",
  },
  {
    key: "tokens",
    label: "Tokens",
    href: "/admin/tokens",
    icon: KeyRound,
    countKey: "activeTokens",
  },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: SlidersHorizontal },
  { key: "security", label: "Security", href: "/admin/security", icon: ShieldCheck },
];

/**
 * Compact mobile-only horizontal sub-navigation inside Site Administration.
 * On desktop (`lg:`), the scoped `AdminSettingsLayout` left sidebar provides
 * primary Control Panel navigation cleanly without duplication.
 */
export function AdminSubNav({ active, counts }: AdminSubNavProps) {
  return (
    <nav
      aria-label="Admin navigation"
      className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 pb-2.5 lg:hidden dark:border-zinc-800"
    >
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        const countValue = item.countKey ? counts?.[item.countKey] : undefined;
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
            {typeof countValue === "number" ? (
              <span className="font-mono text-[10px] tabular-nums opacity-75">{countValue}</span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}
