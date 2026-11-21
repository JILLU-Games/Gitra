import { Shield, SlidersHorizontal, Users } from "lucide-react";

type AdminSubNavProps = {
  active: "overview" | "users" | "settings";
  userCount?: number;
};

/**
 * Compact mobile-only horizontal sub-navigation inside Site Administration.
 * On desktop (`lg:`), the scoped `AdminSettingsLayout` left sidebar provides
 * primary Site Administration navigation cleanly without duplication.
 */
export function AdminSubNav({ active, userCount }: AdminSubNavProps) {
  return (
    <nav
      aria-label="Admin navigation"
      className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-2.5 lg:hidden dark:border-zinc-800"
    >
      <a
        href="/admin"
        aria-current={active === "overview" ? "page" : undefined}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium no-underline transition-colors ${
          active === "overview"
            ? "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300"
            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        }`}
      >
        <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Control Panel</span>
      </a>

      <a
        href="/admin/users"
        aria-current={active === "users" ? "page" : undefined}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium no-underline transition-colors ${
          active === "users"
            ? "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300"
            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        }`}
      >
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Users</span>
        {typeof userCount === "number" ? (
          <span className="font-mono text-[11px] tabular-nums opacity-75">{userCount}</span>
        ) : null}
      </a>

      <a
        href="/admin/settings"
        aria-current={active === "settings" ? "page" : undefined}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium no-underline transition-colors ${
          active === "settings"
            ? "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300"
            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Settings</span>
      </a>
    </nav>
  );
}
