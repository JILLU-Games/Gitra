/// <reference lib="dom" />

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";

import {
  canRemoveNamespaceEntry,
  canToggleNamespaceStatus,
  computeUserRoleCounts,
  filterAdminUsers,
  type AdminNamespaceEntry,
  type DirectoryRole,
  type DirectoryStatus,
} from "@/shared/admin/panel";
import { formatRelativeTime } from "@/shared/web";
import { hydrateIsland } from "@/client/hydrate";
import { RemoveUserModal } from "./RemoveUserModal";
import type { AdminUsersIslandProps } from "./types";
import { UserFormModal } from "./UserFormModal";

type IssuedCredentials = {
  handle: string;
  displayName: string;
  password: string;
  action: "created" | "reset";
};

function roleBadgeClass(role: DirectoryRole): string {
  switch (role) {
    case "admin":
      return "border-accent-500/35 bg-accent-500/10 text-accent-700 dark:text-accent-300";
    case "viewer":
      return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function statusBadgeClass(status: DirectoryStatus): string {
  return status === "active"
    ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-400"
    : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";
}

function sortUsers(list: AdminNamespaceEntry[]): AdminNamespaceEntry[] {
  return [...list].sort((a, b) => {
    if (a.isPrimaryAdmin) return -1;
    if (b.isPrimaryAdmin) return 1;
    return a.slug.localeCompare(b.slug);
  });
}

export function AdminUsersIsland({
  primaryNamespaceSlug,
  users: initialUsers,
}: AdminUsersIslandProps) {
  const [users, setUsers] = useState<AdminNamespaceEntry[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | DirectoryRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DirectoryStatus>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminNamespaceEntry | null>(null);
  const [removingUser, setRemovingUser] = useState<AdminNamespaceEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [issuedCredentials, setIssuedCredentials] = useState<IssuedCredentials | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  const counts = useMemo(() => computeUserRoleCounts(users), [users]);
  const filteredUsers = useMemo(
    () => filterAdminUsers(users, { query, role: roleFilter, status: statusFilter }),
    [users, query, roleFilter, statusFilter]
  );
  const hasFilters = query.trim().length > 0 || roleFilter !== "all" || statusFilter !== "all";

  function handleUserCreated(created: AdminNamespaceEntry, issuedPassword?: string) {
    setUsers((prev) => sortUsers([...prev, created]));
    if (issuedPassword) {
      setIssuedCredentials({
        handle: created.slug,
        displayName: created.displayName,
        password: issuedPassword,
        action: "created",
      });
      setCopiedCredentials(false);
    }
  }

  function handleUserUpdated(updated: AdminNamespaceEntry, issuedPassword?: string) {
    setUsers((prev) => sortUsers(prev.map((item) => (item.id === updated.id ? updated : item))));
    if (issuedPassword) {
      setIssuedCredentials({
        handle: updated.slug,
        displayName: updated.displayName,
        password: issuedPassword,
        action: "reset",
      });
      setCopiedCredentials(false);
    }
  }

  function handleUserRemoved(userId: string) {
    setUsers((prev) => prev.filter((item) => item.id !== userId));
  }

  function handleCopyCredentials() {
    if (!issuedCredentials) return;
    const text = `Username: @${issuedCredentials.handle}\nPassword: ${issuedCredentials.password}`;
    navigator.clipboard?.writeText(text).then(
      () => setCopiedCredentials(true),
      () => setCopiedCredentials(false)
    );
  }

  async function handleQuickToggleStatus(entry: AdminNamespaceEntry) {
    if (!canToggleNamespaceStatus(entry)) return;
    setBannerError(null);
    setBusyId(entry.id);
    const nextStatus: DirectoryStatus = entry.status === "active" ? "disabled" : "active";
    try {
      const res = await fetch(`/admin/api/users/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: DirectoryStatus;
        lastActiveAt?: number;
        hasPassword?: boolean;
        reason?: string;
      };
      if (!res.ok || !data.ok) {
        setBannerError(
          data.reason === "protected-admin"
            ? "The signed-in primary admin cannot be disabled."
            : "Failed to update user status."
        );
        return;
      }
      handleUserUpdated({
        ...entry,
        status: data.status ?? nextStatus,
        lastActiveAt: data.lastActiveAt ?? entry.lastActiveAt,
        hasPassword: data.hasPassword ?? entry.hasPassword,
      });
    } catch {
      setBannerError("Network error while updating user status.");
    } finally {
      setBusyId(null);
    }
  }

  function resetFilters() {
    setQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-3.5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
        <div>
          <h1 className="m-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Users &amp; Accounts
          </h1>
          <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Manage directory accounts, roles, login passwords, and active or disabled status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3 text-xs font-medium text-white transition-colors hover:bg-accent-700"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Add user</span>
        </button>
      </header>

      {/* Compact Metrics Strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="User directory metrics">
        <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Total Users</span>
            <Users className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {counts.total}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {counts.active} active · {counts.disabled} disabled
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Role Breakdown</span>
            <UserCheck className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span className="rounded border border-accent-500/35 bg-accent-500/10 px-1.5 py-0.5 text-accent-700 dark:text-accent-300">
              {counts.admins} admin
            </span>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {counts.members} member
            </span>
            <span className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              {counts.viewers} viewer
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>Primary Admin</span>
            <Shield
              className="h-3.5 w-3.5 text-accent-600 dark:text-accent-400"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "@admin"}
            </span>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              protected
            </span>
          </div>
        </div>
      </div>

      {/* One-time Credentials Handoff Banner */}
      {issuedCredentials ? (
        <div
          role="status"
          aria-label="One-time credentials notice"
          className="rounded-lg border border-emerald-600/35 bg-emerald-500/10 px-4 py-3 text-xs text-zinc-900 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-zinc-100"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {issuedCredentials.action === "created"
                    ? `Credentials ready for ${issuedCredentials.displayName} — copy now`
                    : `Password reset for ${issuedCredentials.displayName} — copy now`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                <span>
                  <span className="text-zinc-500 dark:text-zinc-400">Username: </span>
                  <strong className="font-semibold text-zinc-900 select-all dark:text-zinc-100">
                    @{issuedCredentials.handle}
                  </strong>
                </span>
                <span>
                  <span className="text-zinc-500 dark:text-zinc-400">Password: </span>
                  <code className="rounded border border-emerald-600/30 bg-white/80 px-1.5 py-0.5 font-semibold text-zinc-900 select-all dark:border-emerald-500/30 dark:bg-zinc-950/80 dark:text-zinc-100">
                    {issuedCredentials.password}
                  </code>
                </span>
              </div>
              <p className="m-0 text-[11px] text-zinc-600 dark:text-zinc-400">
                Shown once. Share securely — this password is stored hashed and cannot be viewed
                again after you dismiss this banner. Users can change it anytime in Account →
                Password &amp; Security.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-600/40 bg-white px-2.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/40 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
              >
                {copiedCredentials ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>Copy credentials</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIssuedCredentials(null)}
                aria-label="Dismiss credentials notice"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Directory Card */}
      <section
        aria-label="Users directory"
        className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-2 border-b border-zinc-200 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by @handle or name..."
              aria-label="Search users"
              className="h-8 w-full rounded-md border border-zinc-200 bg-white pr-3 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "all" | DirectoryRole)}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | DirectoryStatus)}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>

            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span>Reset</span>
              </button>
            ) : null}

            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {filteredUsers.length} / {users.length}
            </span>
          </div>
        </div>

        {bannerError ? (
          <div
            role="alert"
            className="mx-3.5 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          >
            {bannerError}
          </div>
        ) : null}

        {filteredUsers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="m-0 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No matching users found
            </p>
            <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Adjust your search query or role/status filters to see directory accounts.
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
                  <th className="px-3.5 py-2.5">User / @namespace</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Role</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Status</th>
                  <th className="hidden px-3 py-2.5 md:table-cell">Activity</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredUsers.map((entry) => {
                  const canToggle = canToggleNamespaceStatus(entry);
                  const canRemove = canRemoveNamespaceEntry(entry);
                  const isBusy = busyId === entry.id;
                  const loginStatusLabel = entry.isPrimaryAdmin
                    ? "env / demo"
                    : entry.hasPassword
                      ? "password set"
                      : "no password";

                  return (
                    <tr
                      key={entry.id}
                      className="transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {entry.displayName}
                            </span>
                            {entry.isPrimaryAdmin ? (
                              <span className="rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-accent-700 dark:text-accent-300">
                                primary
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>@{entry.slug}</span>
                            <span>·</span>
                            <span>
                              {entry.repoCount} {entry.repoCount === 1 ? "repo" : "repos"}
                            </span>
                            <span>·</span>
                            <span
                              className={
                                !entry.isPrimaryAdmin && !entry.hasPassword
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-zinc-500 dark:text-zinc-400"
                              }
                            >
                              {loginStatusLabel}
                            </span>
                            <span className="md:hidden">·</span>
                            <span className="md:hidden" suppressHydrationWarning>
                              active {formatRelativeTime(entry.lastActiveAt)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${roleBadgeClass(entry.role)}`}
                            >
                              {entry.role}
                            </span>
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${statusBadgeClass(entry.status)}`}
                            >
                              {entry.status}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${roleBadgeClass(entry.role)}`}
                        >
                          {entry.role}
                        </span>
                      </td>

                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <span
                          className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${statusBadgeClass(entry.status)}`}
                        >
                          {entry.status}
                        </span>
                      </td>

                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <div className="flex flex-col gap-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span>
                            Created{" "}
                            <span
                              className="font-mono text-zinc-700 dark:text-zinc-300"
                              suppressHydrationWarning
                            >
                              {formatRelativeTime(entry.createdAt)}
                            </span>
                          </span>
                          <span>
                            Active{" "}
                            <span
                              className="font-mono text-zinc-700 dark:text-zinc-300"
                              suppressHydrationWarning
                            >
                              {formatRelativeTime(entry.lastActiveAt)}
                            </span>
                          </span>
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {canToggle ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickToggleStatus(entry)}
                              aria-label={`${entry.status === "active" ? "Disable" : "Enable"} @${entry.slug}`}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              {entry.status === "active" ? (
                                <>
                                  <UserMinus className="h-3 w-3" aria-hidden="true" />
                                  <span>Disable</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3" aria-hidden="true" />
                                  <span>Enable</span>
                                </>
                              )}
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setEditingUser(entry)}
                            aria-label={`Edit @${entry.slug}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            <span>Edit</span>
                          </button>

                          {canRemove ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setRemovingUser(entry)}
                              aria-label={`Remove @${entry.slug}`}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/30 bg-transparent px-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span>Remove</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex h-7 items-center rounded-md border border-zinc-200/80 px-2 font-mono text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500"
                              title="Primary signed-in admin cannot be disabled or removed"
                            >
                              protected
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen ? (
        <UserFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onCreated={handleUserCreated}
          onUpdated={handleUserUpdated}
        />
      ) : null}

      {editingUser ? (
        <UserFormModal
          mode="edit"
          initialUser={editingUser}
          onClose={() => setEditingUser(null)}
          onCreated={handleUserCreated}
          onUpdated={handleUserUpdated}
        />
      ) : null}

      {removingUser ? (
        <RemoveUserModal
          user={removingUser}
          onClose={() => setRemovingUser(null)}
          onRemoved={handleUserRemoved}
        />
      ) : null}
    </div>
  );
}

export function initAdminUsersIsland() {
  hydrateIsland<AdminUsersIslandProps>("admin-users", AdminUsersIsland);
}
