import type { ReactNode } from "react";
import {
  FolderGit2,
  KeyRound,
  LayoutDashboard,
  PanelLeft,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
  X,
} from "lucide-react";

export type AdminSettingsSection =
  "overview" | "users" | "repositories" | "tokens" | "settings" | "security";

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

type NavItem = {
  key: AdminSettingsSection;
  label: string;
  href: string;
  icon: typeof Shield;
  countKey?: keyof AdminNavCounts;
};

type NavGroup = {
  heading: string;
  items: ReadonlyArray<NavItem>;
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

function getActiveAdminLabel(active: AdminSettingsSection): string {
  for (const group of ADMIN_NAV_GROUPS) {
    const match = group.items.find((item) => item.key === active);
    if (match) return match.label;
  }
  return "Dashboard";
}

function AdminSidebarBody({
  active,
  counts,
  isDrawer = false,
}: {
  active: AdminSettingsSection;
  counts?: AdminNavCounts;
  isDrawer?: boolean;
}) {
  return (
    <>
      {/* Grouped Navigation */}
      <nav
        className="space-y-2 p-2"
        aria-label={isDrawer ? "Control panel drawer sections" : "Control panel sections"}
      >
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.heading}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fgMuted">
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
                      data-sidebar-link={isDrawer ? "true" : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={`group relative flex h-7.5 items-center justify-between gap-1.5 rounded-md px-2 text-[12px] no-underline transition-colors ${
                        isActive
                          ? "bg-surfaceHover font-medium text-fg"
                          : "font-normal text-fgBody hover:bg-surfaceHover/60 hover:text-fg"
                      }`}
                    >
                      {isActive ? (
                        <span
                          className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-r bg-fg"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive ? "text-fg" : "text-fgMuted group-hover:text-fgBody"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {typeof countValue === "number" ? (
                        <span
                          className={`shrink-0 text-[11px] font-medium tabular-nums ${
                            isActive ? "text-fg" : "text-fgMuted"
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
      <div className="border-t border-border p-2">
        <nav
          className="space-y-0.5"
          aria-label={isDrawer ? "Control panel drawer quick links" : "Quick links"}
        >
          <a
            href="/user/settings"
            data-sidebar-link={isDrawer ? "true" : undefined}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-fgMuted no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            <User className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">User Settings</span>
          </a>
          <a
            href="/"
            data-sidebar-link={isDrawer ? "true" : undefined}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-fgMuted no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">Back to Repositories</span>
          </a>
        </nav>
      </div>
    </>
  );
}

export function AdminSettingsLayout({ active, counts, children }: AdminSettingsLayoutProps) {
  const activeLabel = getActiveAdminLabel(active);

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)] md:grid-cols-[196px_minmax(0,1fr)] lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-6">
      {/* Narrow-phone (<640px) slide-over left sidebar trigger — never horizontal top tabs */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          data-sidebar-open
          aria-expanded="false"
          aria-controls="admin-sidebar-drawer"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-surfaceHover"
        >
          <PanelLeft className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
          <span>Control Panel</span>
          <span className="text-fgMuted" aria-hidden="true">
            ·
          </span>
          <span className="truncate text-fgBody">{activeLabel}</span>
        </button>
      </div>

      {/* Mobile Slide-Over Left Sidebar Drawer (<640px) */}
      <div
        id="admin-sidebar-drawer"
        data-sidebar-drawer
        data-open="false"
        role="dialog"
        aria-modal="true"
        aria-label="Control panel sidebar drawer"
        className="mobile-sidebar-drawer fixed inset-0 z-[100] sm:hidden"
      >
        <div
          data-sidebar-backdrop
          className="mobile-sidebar-backdrop fixed inset-0 bg-canvas/70 transition-opacity duration-150"
          aria-hidden="true"
        />
        <aside className="mobile-sidebar-panel relative z-10 flex h-full w-64 max-w-[82vw] flex-col border-r border-border bg-surface transition-transform duration-150">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-canvas text-fgBody">
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold leading-tight text-fg">
                  Control Panel
                </div>
                <div className="truncate text-[10px] leading-tight text-fgMuted">
                  Site Administration
                </div>
              </div>
            </div>
            <button
              type="button"
              data-sidebar-close
              aria-label="Close control panel sidebar"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-fgMuted hover:bg-surfaceHover hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AdminSidebarBody active={active} counts={counts} isDrawer />
          </div>
        </aside>
      </div>

      {/* Persistent Compact Vertical Left Sidebar (>=640px: split-pane preview, tablet, desktop) */}
      <aside
        aria-label="Site administration navigation"
        className="hidden sm:sticky sm:top-16 sm:block"
      >
        <div className="rounded-md border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-canvas text-fgBody">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold leading-tight text-fg">
                Control Panel
              </div>
              <div className="truncate text-[10px] leading-tight text-fgMuted">
                Site Administration
              </div>
            </div>
          </div>

          <AdminSidebarBody active={active} counts={counts} />
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
