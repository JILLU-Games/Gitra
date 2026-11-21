import { ArrowRight, Check, KeyRound, Lock, ShieldCheck, Users, X } from "lucide-react";

import { AdminSettingsLayout, type AdminNavCounts } from "@/client/components/AdminSettingsLayout";
import { AdminSubNav } from "@/client/components/AdminSubNav";

export type AdminSecurityPageProps = {
  authMode: "demo" | "configured";
  primaryAdminHandle: string;
  totalUsers: number;
  disabledUsers: number;
  usersWithPasswords: number;
  counts?: AdminNavCounts;
};

const RBAC_MATRIX: ReadonlyArray<{
  capability: string;
  admin: boolean;
  member: boolean;
  viewer: boolean;
}> = [
  { capability: "Access Control Panel (/admin/*)", admin: true, member: false, viewer: false },
  { capability: "Create, edit, disable, and reset user passwords", admin: true, member: false, viewer: false },
  { capability: "Create repositories & push commits over HTTPS", admin: true, member: true, viewer: false },
  { capability: "Generate read-write (push) Personal Access Tokens", admin: true, member: true, viewer: false },
  { capability: "Generate read-only (pull) Personal Access Tokens", admin: true, member: true, viewer: true },
  { capability: "Clone public & authorized private repositories", admin: true, member: true, viewer: true },
  { capability: "Change own account password (/user/settings/security)", admin: true, member: true, viewer: true },
];

export function AdminSecurityPage({
  authMode,
  primaryAdminHandle,
  totalUsers,
  disabledUsers,
  usersWithPasswords,
  counts,
}: AdminSecurityPageProps) {
  return (
    <AdminSettingsLayout active="security" counts={counts}>
      <div className="space-y-5">
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-3.5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
          <div>
            <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Security &amp; Policies
            </h1>
            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Role-based access control matrix, credential hashing, and session enforcement rules.
            </p>
          </div>
          <a
            href="/admin/users"
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Users className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            <span>Audit Users</span>
            <ArrowRight className="h-3 w-3 text-zinc-400" aria-hidden="true" />
          </a>
        </header>

        <AdminSubNav active="security" counts={counts} />

        {/* Security Metrics Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span>Password Coverage</span>
              <KeyRound className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {usersWithPasswords}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                of {totalUsers} users
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span>Disabled Accounts</span>
              <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {disabledUsers}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                revoked immediately
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span>Primary Admin</span>
              <ShieldCheck
                className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
                aria-hidden="true"
              />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                @{primaryAdminHandle}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {authMode === "configured" ? "env secret" : "demo mode"}
              </span>
            </div>
          </div>
        </div>

        {/* Role-Based Access Control Matrix */}
        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
            Role-Based Access Control (RBAC) Matrix
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                  <th className="px-4 py-2">Capability</th>
                  <th className="px-3 py-2 text-center">Admin</th>
                  <th className="px-3 py-2 text-center">Member</th>
                  <th className="px-3 py-2 text-center">Viewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {RBAC_MATRIX.map((row) => (
                  <tr
                    key={row.capability}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30"
                  >
                    <td className="px-4 py-2.5 text-zinc-800 dark:text-zinc-200">
                      {row.capability}
                    </td>
                    {[row.admin, row.member, row.viewer].map((allowed, idx) => (
                      <td key={idx} className="px-3 py-2.5 text-center">
                        {allowed ? (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            aria-label="Allowed"
                          >
                            <Check className="h-3 w-3" aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-600"
                            aria-label="Restricted"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Active Security Controls */}
        <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
            Cryptographic &amp; Transport Controls
          </div>
          <dl className="m-0 divide-y divide-zinc-200 text-xs dark:divide-zinc-800">
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Password Derivation</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">
                PBKDF2-SHA256 · 100,000 iterations · 16-byte salt · constant-time compare
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Session Cookie</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">
                HMAC-signed · HttpOnly · Secure · Partitioned · SameSite=None
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">CSRF Protection</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">
                Strict same-origin enforcement on all state-changing endpoints
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center">
              <dt className="text-zinc-500 dark:text-zinc-400">Personal Access Tokens</dt>
              <dd className="m-0 font-mono text-zinc-900 dark:text-zinc-100">
                SHA-256 hashed at rest · shown once at creation · namespace or repo scoped
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </AdminSettingsLayout>
  );
}
