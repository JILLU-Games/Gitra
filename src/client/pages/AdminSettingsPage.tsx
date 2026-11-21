import { ArrowRight, KeyRound, Lock, Shield, Users } from "lucide-react";

import { AdminSettingsLayout } from "@/client/components/AdminSettingsLayout";

export type AdminSettingsPageProps = {
  authMode: "demo" | "configured";
  primaryAdminHandle: string;
  totalUsers: number;
  activeUsers: number;
  totalRepositories: number;
  publicRepositories: number;
  privateRepositories: number;
  origin: string;
};

export function AdminSettingsPage({
  authMode,
  primaryAdminHandle,
  totalUsers,
  activeUsers,
  totalRepositories,
  publicRepositories,
  privateRepositories,
  origin,
}: AdminSettingsPageProps) {
  return (
    <AdminSettingsLayout active="settings">
      <div className="space-y-6">
        <header className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <h1 className="m-0 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Settings Control Panel
          </h1>
          <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Instance authentication mode, security policies, and directory overview for this Git
            server.
          </p>
        </header>

        {/* Instance & Auth Configuration */}
        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
            Instance &amp; Authentication
          </div>
          <dl className="m-0 divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
            <div className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Server Origin</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">{origin}</dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Primary Administrator</dt>
              <dd className="m-0 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                @{primaryAdminHandle}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Admin Auth Mode</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">
                {authMode === "configured"
                  ? "Configured (ADMIN_PASSWORD set · Demo Login disabled)"
                  : "Demo / Live Preview (ADMIN_PASSWORD unset · Quick Demo Login enabled)"}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">User Password Storage</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">
                PBKDF2-SHA256 · 100,000 iterations · 16-byte random salt
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Git Smart HTTP v2 Auth</dt>
              <dd className="m-0 text-zinc-800 dark:text-zinc-200">
                Public repos allow anonymous clone; private &amp; push require scoped PAT
              </dd>
            </div>
          </dl>
        </section>

        {/* Directory & Repository Summary */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>User Directory</span>
              <Users className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            </div>
            <p className="m-0 mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {totalUsers}
            </p>
            <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {activeUsers} active · {totalUsers - activeUsers} disabled
            </p>
            <a
              href="/admin/users"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-600 no-underline hover:underline dark:text-accent-400"
            >
              <span>Manage users &amp; passwords</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>Repositories</span>
              <Shield className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            </div>
            <p className="m-0 mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {totalRepositories}
            </p>
            <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {publicRepositories} public · {privateRepositories} private
            </p>
            <a
              href="/admin"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-600 no-underline hover:underline dark:text-accent-400"
            >
              <span>Open Control Panel</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Security Guardrails */}
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="m-0 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Active Security Policies
          </h2>
          <ul className="m-0 mt-2.5 space-y-2 pl-0 text-xs text-zinc-600 dark:text-zinc-400">
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
              <span>
                Disabling any directory user immediately invalidates their active browser session
                and blocks future sign-ins.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
              <span>
                Role-based access control enforces <span className="font-mono">admin</span>{" "}
                separation on <span className="font-mono">/admin/*</span> and read-only enforcement
                for <span className="font-mono">viewer</span> accounts.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </AdminSettingsLayout>
  );
}
