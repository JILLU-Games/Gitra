import { FolderGit2, GitBranch, KeyRound, Shield, User, Users, X } from "lucide-react";

import {
  canAccessAdminPanel,
  resolveActiveSidebarItem,
  type SidebarNavKey,
} from "@/shared/admin/panel";
import type { Viewer } from "@/client/server/viewer";

type SidebarProps = {
  currentView?: string;
  viewer: Viewer;
};

type NavItem = {
  key: SidebarNavKey;
  label: string;
  href: string;
  icon: typeof FolderGit2;
};

const WORKSPACE_ITEMS: readonly NavItem[] = [
  { key: "repositories", label: "Repositories", href: "/", icon: FolderGit2 },
  { key: "account", label: "Account", href: "/auth/account", icon: User },
];

const ADMIN_ITEMS: readonly NavItem[] = [
  { key: "admin", label: "Admin Panel", href: "/admin", icon: Shield },
  { key: "admin-users", label: "Users", href: "/admin/users", icon: Users },
];

function navItemClasses(active: boolean): string {
  return [
    "sidebar-nav-link flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm font-medium no-underline transition-colors",
    active
      ? "border-accent-500/30 bg-accent-500/10 text-accent-700 dark:border-accent-500/35 dark:bg-accent-500/15 dark:text-accent-300"
      : "border-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
  ].join(" ");
}

function SidebarNavGroup({
  title,
  items,
  activeKey,
  closeOnSelect,
}: {
  title: string;
  items: readonly NavItem[];
  activeKey: SidebarNavKey | null;
  closeOnSelect: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="sidebar-section-title px-2.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {title}
      </div>
      <nav className="flex flex-col gap-1" aria-label={`${title} navigation`}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeKey === item.key;
          return (
            <a
              key={item.key}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              data-sidebar-link={closeOnSelect ? "true" : undefined}
              className={navItemClasses(active)}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  active ? "text-accent-600 dark:text-accent-400" : "text-zinc-500 dark:text-zinc-400"
                }`}
                aria-hidden="true"
              />
              <span className="sidebar-label truncate">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarNavList({
  activeKey,
  viewer,
  closeOnSelect = false,
}: {
  activeKey: SidebarNavKey | null;
  viewer: Viewer;
  closeOnSelect?: boolean;
}) {
  const handle = viewer.primaryNamespaceSlug ? `@${viewer.primaryNamespaceSlug}` : "Account";
  const isAdmin = canAccessAdminPanel(viewer.role);
  const tokensHref = isAdmin ? "/admin#tokens" : "/auth/account#tokens";

  return (
    <div className="flex h-full flex-col justify-between gap-4 p-2.5">
      <div className="space-y-4">
        <SidebarNavGroup
          title="Workspace"
          items={WORKSPACE_ITEMS}
          activeKey={activeKey}
          closeOnSelect={closeOnSelect}
        />
        {isAdmin ? (
          <div className="border-t border-zinc-200/80 pt-3 dark:border-zinc-800/80">
            <SidebarNavGroup
              title="Admin"
              items={ADMIN_ITEMS}
              activeKey={activeKey}
              closeOnSelect={closeOnSelect}
            />
          </div>
        ) : null}
      </div>

      <div className="sidebar-footer-expanded border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
              {handle}
            </span>
            <span className="rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-accent-700 dark:border-accent-500/30 dark:text-accent-300">
              {viewer.role}
            </span>
          </div>
          <a
            href={tokensHref}
            data-sidebar-link={closeOnSelect ? "true" : undefined}
            className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600 no-underline hover:text-accent-600 dark:text-zinc-400 dark:hover:text-accent-400"
          >
            <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Manage access tokens</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ currentView, viewer }: SidebarProps) {
  const activeKey = resolveActiveSidebarItem(currentView);

  return (
    <>
      {/* Persistent desktop collapsible sidebar */}
      <aside
        aria-label="Primary sidebar"
        className="app-sidebar hidden shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-150 lg:flex dark:border-zinc-800 dark:bg-zinc-900"
      >
        <SidebarNavList activeKey={activeKey} viewer={viewer} />
      </aside>

      {/* Mobile slide-over navigation drawer */}
      <div
        id="mobile-sidebar-drawer"
        data-sidebar-drawer
        data-open="false"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="mobile-sidebar-drawer fixed inset-0 z-[100] flex lg:hidden"
      >
        <div
          data-sidebar-backdrop
          className="mobile-sidebar-backdrop fixed inset-0 bg-zinc-950/50 transition-opacity duration-150"
          aria-hidden="true"
        />
        <div className="mobile-sidebar-panel relative z-10 flex h-full w-64 max-w-[82vw] flex-col border-r border-zinc-200 bg-white transition-transform duration-150 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-12 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
            <a
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-zinc-900 no-underline dark:text-zinc-100"
            >
              <GitBranch className="h-4 w-4 text-accent-600 dark:text-accent-400" aria-hidden="true" />
              <span>git-on-cloudflare</span>
            </a>
            <button
              type="button"
              data-sidebar-close
              aria-label="Close navigation menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNavList activeKey={activeKey} viewer={viewer} closeOnSelect />
          </div>
        </div>
      </div>
    </>
  );
}
