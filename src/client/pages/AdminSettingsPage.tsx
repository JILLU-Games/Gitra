import { ArrowRight, KeyRound, Lock, Shield, Users } from "lucide-react";

import { AdminSettingsLayout, type AdminNavCounts } from "@/client/components/AdminSettingsLayout";
import { AdminSettingsIsland } from "@/client/islands/admin-settings";
import { IslandHost } from "@/client/server/IslandHost";
import { buildNamespaceProfileHref } from "@/shared/admin/panel";
import { DEFAULT_SITE_BRANDING, type SiteBrandingConfig } from "@/shared/branding";

export type AdminSettingsPageProps = {
  authMode: "demo" | "configured";
  primaryAdminHandle: string;
  primaryAdminNamespaceSlug?: string;
  totalUsers: number;
  activeUsers: number;
  totalRepositories: number;
  publicRepositories: number;
  privateRepositories: number;
  activeTokens?: number;
  origin: string;
  branding?: SiteBrandingConfig;
};

export function AdminSettingsPage({
  authMode,
  primaryAdminHandle,
  primaryAdminNamespaceSlug,
  totalUsers,
  activeUsers,
  totalRepositories,
  publicRepositories,
  privateRepositories,
  activeTokens,
  origin,
  branding,
}: AdminSettingsPageProps) {
  const publicNamespace = primaryAdminNamespaceSlug ?? primaryAdminHandle;
  const resolvedBranding = branding ?? DEFAULT_SITE_BRANDING;
  const counts: AdminNavCounts = {
    users: totalUsers,
    repositories: totalRepositories,
    activeTokens,
  };

  return (
    <AdminSettingsLayout active="settings" counts={counts}>
      <div className="space-y-4">
        <header className="border-b border-border pb-3.5">
          <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">
            Settings Control Panel
          </h1>
          <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
            Site branding configuration, runtime environment status, and directory overview for this
            Git server.
          </p>
        </header>

        <IslandHost name="admin-settings" props={{ initialBranding: resolvedBranding }}>
          <AdminSettingsIsland initialBranding={resolvedBranding} />
        </IslandHost>

        {/* Instance & Auth Configuration (Env-configured / Read-only) */}
        <section className="rounded-md border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[13px] font-semibold text-fg">Instance &amp; Authentication</span>
            <span className="rounded border border-border bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-fgMuted">
              env-configured · read-only
            </span>
          </div>
          <dl className="m-0 divide-y divide-borderSubtle text-[12px]">
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Server Origin</dt>
              <dd className="m-0 break-all font-mono text-fg sm:text-right">{origin}</dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Admin Sign-in Username</dt>
              <dd className="m-0 flex flex-wrap items-center gap-2 font-mono text-fg sm:justify-end">
                <span className="font-medium">{primaryAdminHandle}</span>
                <span className="text-[11px] font-sans text-fgMuted">
                  (env-configured · private)
                </span>
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Public Git Namespace</dt>
              <dd className="m-0 flex flex-wrap items-center gap-2 sm:justify-end">
                <a
                  href={buildNamespaceProfileHref(publicNamespace)}
                  className="font-mono font-medium text-accent no-underline hover:underline"
                >
                  @{publicNamespace}
                </a>
                <a
                  href="/admin/users"
                  className="text-[11px] text-fgMuted no-underline hover:text-fg hover:underline"
                >
                  Rename
                </a>
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Admin Auth Mode</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                {authMode === "configured" ? (
                  <>
                    Configured (<code className="font-mono">ADMIN_PASSWORD</code> set · Demo Login
                    disabled)
                  </>
                ) : (
                  <>
                    Demo / Live Preview (<code className="font-mono">ADMIN_PASSWORD</code> unset ·
                    Quick Demo Login enabled)
                  </>
                )}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">User Password Storage</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                <code className="font-mono">PBKDF2-SHA256</code> · 100,000 iterations · 16-byte
                random salt
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Git Smart HTTP v2 Auth</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                Public repos allow anonymous clone; private &amp; push require scoped PAT
              </dd>
            </div>
          </dl>
        </section>

        {/* Directory & Repository Summary */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-[13px] font-medium text-fg">
              <span>User Directory</span>
              <Users className="h-4 w-4 text-fgMuted" aria-hidden="true" />
            </div>
            <p className="m-0 mt-2 text-[20px] font-semibold tabular-nums text-fg">{totalUsers}</p>
            <p className="m-0 mt-1 text-[12px] text-fgMuted">
              {activeUsers} active · {totalUsers - activeUsers} disabled
            </p>
            <a
              href="/admin/users"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent no-underline hover:underline"
            >
              <span>Manage users &amp; passwords</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-[13px] font-medium text-fg">
              <span>Repositories</span>
              <Shield className="h-4 w-4 text-fgMuted" aria-hidden="true" />
            </div>
            <p className="m-0 mt-2 text-[20px] font-semibold tabular-nums text-fg">
              {totalRepositories}
            </p>
            <p className="m-0 mt-1 text-[12px] text-fgMuted">
              {publicRepositories} public · {privateRepositories} private
            </p>
            <a
              href="/admin/repositories"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent no-underline hover:underline"
            >
              <span>Manage repositories</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Security Guardrails */}
        <section className="rounded-md border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-semibold text-fg">Active Security Policies</h2>
            <a
              href="/admin/security"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent no-underline hover:underline"
            >
              <span>Full RBAC &amp; Security</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <ul className="m-0 mt-2.5 space-y-2 pl-0 text-[12px] text-fgBody">
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
              <span>
                Disabling any directory user immediately invalidates their active browser session
                and blocks future sign-ins.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fgMuted" aria-hidden="true" />
              <span>
                Role-based access control enforces <span className="font-mono text-fg">admin</span>{" "}
                separation on <span className="font-mono text-fg">/admin/*</span> and read-only
                enforcement for <span className="font-mono text-fg">viewer</span> accounts.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </AdminSettingsLayout>
  );
}
