import { ArrowRight, Check, KeyRound, Lock, ShieldCheck, Users, X } from "lucide-react";

import { AdminSettingsLayout, type AdminNavCounts } from "@/client/components/AdminSettingsLayout";
import { buildNamespaceProfileHref } from "@/shared/admin/panel";

export type AdminSecurityPageProps = {
  authMode: "demo" | "configured";
  authSource?: "demo" | "env" | "d1";
  primaryAdminHandle: string;
  primaryAdminNamespaceSlug?: string;
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
  {
    capability: "Create, edit, disable, and reset user passwords",
    admin: true,
    member: false,
    viewer: false,
  },
  {
    capability: "Create repositories & push commits over HTTPS",
    admin: true,
    member: true,
    viewer: false,
  },
  {
    capability: "Generate read-write (push) Personal Access Tokens",
    admin: true,
    member: true,
    viewer: false,
  },
  {
    capability: "Generate read-only (pull) Personal Access Tokens",
    admin: true,
    member: true,
    viewer: true,
  },
  {
    capability: "Clone public & authorized private repositories",
    admin: true,
    member: true,
    viewer: true,
  },
  {
    capability: "Change own account password (/user/settings/security)",
    admin: true,
    member: true,
    viewer: true,
  },
];

export function AdminSecurityPage({
  authMode,
  authSource,
  primaryAdminHandle,
  primaryAdminNamespaceSlug,
  totalUsers,
  disabledUsers,
  usersWithPasswords,
  counts,
}: AdminSecurityPageProps) {
  const resolvedAuthSource = authSource ?? (authMode === "configured" ? "env" : "demo");
  const publicNamespace = primaryAdminNamespaceSlug ?? primaryAdminHandle;
  return (
    <AdminSettingsLayout active="security" counts={counts}>
      <div className="space-y-4">
        <header className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">
              Security &amp; Policies
            </h1>
            <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
              Role-based access control matrix, credential hashing, and session enforcement rules.
            </p>
          </div>
          <a
            href="/admin/users"
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-none border border-border bg-canvas px-3 text-[12px] font-medium text-fgBody no-underline transition-colors hover:bg-surfaceHover hover:text-fg"
          >
            <Users className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            <span>Audit Users</span>
            <ArrowRight className="h-3 w-3 text-fgMuted" aria-hidden="true" />
          </a>
        </header>

        {/* Security Metrics Strip */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-none border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between text-[12px] font-medium text-fgMuted">
              <span>Password Coverage</span>
              <KeyRound className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[20px] font-semibold tabular-nums text-fg">
                {usersWithPasswords}
              </span>
              <span className="text-[11px] tabular-nums text-fgMuted">of {totalUsers} users</span>
            </div>
          </div>

          <div className="rounded-none border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between text-[12px] font-medium text-fgMuted">
              <span>Disabled Accounts</span>
              <Lock className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[20px] font-semibold tabular-nums text-fg">
                {disabledUsers}
              </span>
              <span className="text-[11px] text-fgMuted">revoked immediately</span>
            </div>
          </div>

          <div className="rounded-none border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between text-[12px] font-medium text-fgMuted">
              <span>Primary Admin</span>
              <ShieldCheck className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <a
                href={buildNamespaceProfileHref(publicNamespace)}
                className="truncate font-mono text-[13px] font-semibold text-fg no-underline hover:text-accent hover:underline"
                title="Public Git namespace"
              >
                @{publicNamespace}
              </a>
              <span
                className="truncate font-mono text-[11px] text-fgMuted"
                title="Sign-in username"
              >
                {`login: ${primaryAdminHandle} (${resolvedAuthSource})`}
              </span>
            </div>
          </div>
        </div>

        {/* Role-Based Access Control Matrix */}
        <section className="overflow-hidden rounded-none border border-border bg-surface">
          <div className="border-b border-border px-4 py-2.5 text-[13px] font-semibold text-fg">
            Role-Based Access Control (RBAC) Matrix
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  <th className="px-4 py-2">Capability</th>
                  <th className="px-3 py-2 text-center">Admin</th>
                  <th className="px-3 py-2 text-center">Member</th>
                  <th className="px-3 py-2 text-center">Viewer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle">
                {RBAC_MATRIX.map((row) => (
                  <tr key={row.capability} className="hover:bg-surfaceHover/50">
                    <td className="px-4 py-2.5 text-[13px] text-fgBody">{row.capability}</td>
                    {[row.admin, row.member, row.viewer].map((allowed, idx) => (
                      <td key={idx} className="px-3 py-2.5 text-center">
                        {allowed ? (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-none border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            aria-label="Allowed"
                          >
                            <Check className="h-3 w-3" aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-none border border-border bg-canvas text-fgMuted"
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
        <section className="rounded-none border border-border bg-surface">
          <div className="border-b border-border px-4 py-2.5 text-[13px] font-semibold text-fg">
            Cryptographic &amp; Transport Controls
          </div>
          <dl className="m-0 divide-y divide-borderSubtle text-[12px]">
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Password Derivation</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                <code className="font-mono">PBKDF2-SHA256</code> · 100,000 iterations · 16-byte salt
                · constant-time compare
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Session Cookie</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                AES-256-GCM encrypted · <code className="font-mono">HttpOnly</code> ·{" "}
                <code className="font-mono">Secure</code> ·{" "}
                <code className="font-mono">Partitioned</code> ·{" "}
                <code className="font-mono">SameSite=None</code>
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">CSRF Protection</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                Strict same-origin enforcement on all state-changing endpoints
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <dt className="shrink-0 text-fgMuted">Personal Access Tokens</dt>
              <dd className="m-0 break-words text-fgBody sm:text-right">
                <code className="font-mono">SHA-256</code> hashed at rest · shown once at creation ·
                namespace or repo scoped
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </AdminSettingsLayout>
  );
}
