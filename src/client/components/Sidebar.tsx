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
  { key: "account", label: "Account", href: "/user/profile", icon: User },
];

const ADMIN_ITEMS: readonly NavItem[] = [
  { key: "admin", label: "Admin Panel", href: "/admin", icon: Shield },
  { key: "admin-users", label: "Users", href: "/admin/users", icon: Users },
];

function navItemClasses(active: boolean): string {
  return [
    "sidebar-nav-link flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] font-medium no-underline transition-colors",
    active
      ? "border-border bg-surfaceHover text-fg"
      : "border-transparent text-fgBody hover:bg-surfaceHover/60 hover:text-fg",
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
      <div className="sidebar-section-title px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-fgMuted">
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
                className={`h-3.5 w-3.5 shrink-0 ${active ? "text-fg" : "text-fgMuted"}`}
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
  const tokensHref = isAdmin ? "/admin/tokens" : "/user/settings/tokens";

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
          <div className="border-t border-border pt-3">
            <SidebarNavGroup
              title="Admin"
              items={ADMIN_ITEMS}
              activeKey={activeKey}
              closeOnSelect={closeOnSelect}
            />
          </div>
        ) : null}
      </div>

      <div className="sidebar-footer-expanded border-t border-border pt-2.5">
        <div className="rounded-md border border-border bg-canvas px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[12px] font-medium text-fg">{handle}</span>
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-fgMuted">
              {viewer.role}
            </span>
          </div>
          <a
            href={tokensHref}
            data-sidebar-link={closeOnSelect ? "true" : undefined}
            className="mt-2 flex items-center gap-1.5 text-[12px] text-fgBody no-underline hover:text-fg"
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
        className="app-sidebar hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 lg:flex"
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
          className="mobile-sidebar-backdrop fixed inset-0 bg-canvas/70 transition-opacity duration-150"
          aria-hidden="true"
        />
        <div className="mobile-sidebar-panel relative z-10 flex h-full w-64 max-w-[82vw] flex-col border-r border-border bg-surface transition-transform duration-150">
          <div className="flex h-12 items-center justify-between border-b border-border px-3">
            <a
              href="/"
              className="flex items-center gap-2 text-[14px] font-semibold text-fg no-underline"
            >
              <GitBranch className="h-4 w-4 text-fg" aria-hidden="true" />
              <span>git-on-cloudflare</span>
            </a>
            <button
              type="button"
              data-sidebar-close
              aria-label="Close navigation menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-fgMuted hover:bg-surfaceHover hover:text-fg"
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
