import type { ReactNode } from "react";
import { FolderGit2, KeyRound, Lock, PanelLeft, Settings, User, X } from "lucide-react";

export type UserSettingsSection =
  "profile" | "account" | "settings" | "security" | "tokens" | "all";

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
      {
        key: "security",
        label: "Password & Security",
        href: "/user/settings/security",
        icon: Lock,
      },
      { key: "tokens", label: "Access Tokens", href: "/user/settings/tokens", icon: KeyRound },
    ],
  },
];

function getActiveUserLabel(active: UserSettingsSection): string {
  const effective = active === "all" ? "account" : active;
  for (const group of USER_SETTINGS_GROUPS) {
    const match = group.items.find((item) => item.key === effective);
    if (match) return match.label;
  }
  return "Account & Repos";
}

function UserSidebarBody({
  active,
  isDrawer = false,
}: {
  active: UserSettingsSection;
  isDrawer?: boolean;
}) {
  return (
    <nav
      className="space-y-3 p-2.5"
      aria-label={isDrawer ? "User settings drawer sections" : "User settings sections"}
    >
      {USER_SETTINGS_GROUPS.map((group) => (
        <div key={group.heading}>
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fgMuted">
            {group.heading}
          </div>
          <ul className="m-0 list-none space-y-0.5 p-0">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.key || (active === "all" && item.key === "account");
              return (
                <li key={item.key}>
                  <a
                    href={item.href}
                    data-sidebar-link={isDrawer ? "true" : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex h-8 items-center gap-2 rounded-none px-2 text-[12px] no-underline transition-colors ${
                      isActive
                        ? "bg-surfaceHover font-medium text-fg"
                        : "font-normal text-fgBody hover:bg-surfaceHover/60 hover:text-fg"
                    }`}
                  >
                    {isActive ? (
                      <span
                        className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-none bg-fg"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "text-fg" : "text-fgMuted group-hover:text-fgBody"
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
  );
}

export function UserSettingsLayout({ active, handle, children }: UserSettingsLayoutProps) {
  const activeLabel = getActiveUserLabel(active);

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)] md:grid-cols-[196px_minmax(0,1fr)] lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-6">
      {/* Narrow-phone (<640px) slide-over left sidebar trigger — no horizontal top nav */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          data-sidebar-open
          aria-expanded="false"
          aria-controls="user-sidebar-drawer"
          className="inline-flex h-8 items-center gap-2 rounded-none border border-border bg-surface px-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-surfaceHover"
        >
          <PanelLeft className="h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
          <span>User Settings</span>
          <span className="text-fgMuted" aria-hidden="true">
            ·
          </span>
          <span className="truncate text-fgBody">{activeLabel}</span>
        </button>
      </div>

      {/* Mobile Slide-Over Left Sidebar Drawer (<640px) */}
      <div
        id="user-sidebar-drawer"
        data-sidebar-drawer
        data-open="false"
        role="dialog"
        aria-modal="true"
        aria-label="User settings sidebar drawer"
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
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-border bg-canvas text-fgBody">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold leading-tight text-fg">
                  User Settings
                </div>
                {handle ? (
                  <div className="truncate font-mono text-[10px] leading-tight text-fgMuted">
                    {handle}
                  </div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              data-sidebar-close
              aria-label="Close user settings sidebar"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-border text-fgMuted hover:bg-surfaceHover hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <UserSidebarBody active={active} isDrawer />
          </div>
        </aside>
      </div>

      {/* Persistent Compact Vertical Left Sidebar (>=640px: split-pane preview, tablet, desktop) */}
      <aside aria-label="User settings navigation" className="hidden sm:sticky sm:top-16 sm:block">
        <div className="rounded-none border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-border bg-canvas text-fgBody">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold leading-tight text-fg">
                User Settings
              </div>
              {handle ? (
                <div className="truncate font-mono text-[10px] leading-tight text-fgMuted">
                  {handle}
                </div>
              ) : null}
            </div>
          </div>

          <UserSidebarBody active={active} />
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
