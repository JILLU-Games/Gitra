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
import {
  Button,
  ErrorBanner,
  copyToClipboard,
  inputClasses,
  selectClasses,
  showToast,
} from "@/client/components/ui";
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
      return "border-accent/35 bg-accent/10 text-accent";
    case "viewer":
      return "border-amber-500/35 bg-amber-500/10 text-amber-400";
    default:
      return "border-border bg-canvas text-fgBody";
  }
}

function statusBadgeClass(status: DirectoryStatus): string {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : "border-border bg-canvas text-fgMuted";
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
  primaryPasswordManagedByEnv = true,
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
    showToast({
      tone: "success",
      title: "User created",
      message: `@${created.slug} (${created.role})`,
    });
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
    showToast({
      tone: "success",
      title: "User removed",
    });
  }

  function handleCopyCredentials() {
    if (!issuedCredentials) return;
    const text = `Username: @${issuedCredentials.handle}\nPassword: ${issuedCredentials.password}`;
    void copyToClipboard(text, {
      label: "user credentials",
      successTitle: "Credentials copied",
    }).then((ok) => {
      setCopiedCredentials(ok);
    });
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
        const msg =
          data.reason === "protected-admin"
            ? "The signed-in primary admin cannot be disabled."
            : "Failed to update user status.";
        setBannerError(msg);
        showToast({ tone: "error", title: "Status update failed", message: msg });
        return;
      }
      const resolvedStatus = data.status ?? nextStatus;
      handleUserUpdated({
        ...entry,
        status: resolvedStatus,
        lastActiveAt: data.lastActiveAt ?? entry.lastActiveAt,
        hasPassword: data.hasPassword ?? entry.hasPassword,
      });
      showToast({
        tone: "success",
        title: "User status updated",
        message: `@${entry.slug} is now ${resolvedStatus}.`,
      });
    } catch {
      const msg = "Network error while updating user status.";
      setBannerError(msg);
      showToast({ tone: "error", title: "Status update failed", message: msg });
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
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-col gap-2 border-b border-border pb-3.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="m-0 text-[18px] font-semibold tracking-tight text-fg">
            Users &amp; Accounts
          </h1>
          <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
            Manage directory accounts, roles, login passwords, and active or disabled status.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => setCreateOpen(true)}
          className="w-fit"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Add user</span>
        </Button>
      </header>

      {/* Compact Metrics Strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="User directory metrics">
        <div className="rounded-none border border-border bg-surface px-3.5 py-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-fgMuted">
            <span>Total Users</span>
            <Users className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-[20px] font-semibold tabular-nums text-fg">
              {counts.total}
            </span>
            <span className="font-mono text-[11px] text-fgMuted">
              {counts.active} active · {counts.disabled} disabled
            </span>
          </div>
        </div>

        <div className="rounded-none border border-border bg-surface px-3.5 py-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-fgMuted">
            <span>Role Breakdown</span>
            <UserCheck className="h-3.5 w-3.5 text-fgMuted" aria-hidden="true" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span className="rounded-none border border-accent/35 bg-accent/10 px-1.5 py-0.5 text-accent">
              {counts.admins} admin
            </span>
            <span className="rounded-none border border-border bg-canvas px-1.5 py-0.5 text-fgBody">
              {counts.members} member
            </span>
            <span className="rounded-none border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
              {counts.viewers} viewer
            </span>
          </div>
        </div>

        <div className="rounded-none border border-border bg-surface px-3.5 py-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-fgMuted">
            <span>Primary Admin</span>
            <Shield className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-[14px] font-semibold text-fg">
              {primaryNamespaceSlug ? `@${primaryNamespaceSlug}` : "@admin"}
            </span>
            <span className="font-mono text-[11px] text-fgMuted">protected</span>
          </div>
        </div>
      </div>

      {/* One-time Credentials Handoff Banner */}
      {issuedCredentials ? (
        <div
          role="status"
          aria-label="One-time credentials notice"
          className="rounded-none border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-[12px] text-fg"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {issuedCredentials.action === "created"
                    ? `Credentials ready for ${issuedCredentials.displayName} — copy now`
                    : `Password reset for ${issuedCredentials.displayName} — copy now`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px]">
                <span>
                  <span className="text-fgMuted">Username: </span>
                  <strong className="font-semibold text-fg select-all">
                    @{issuedCredentials.handle}
                  </strong>
                </span>
                <span>
                  <span className="text-fgMuted">Password: </span>
                  <code className="rounded-none border border-emerald-500/30 bg-canvas px-1.5 py-0.5 font-semibold text-fg select-all">
                    {issuedCredentials.password}
                  </code>
                </span>
              </div>
              <p className="m-0 text-[11px] text-fgBody">
                Shown once. Share securely — this password is stored hashed and cannot be viewed
                again after you dismiss this banner. Users can change it anytime in Account →
                Password &amp; Security.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="inline-flex h-7 items-center gap-1.5 rounded-none border border-emerald-500/40 bg-canvas px-2.5 text-[11px] font-medium text-emerald-300 hover:bg-surfaceHover"
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
                className="inline-flex h-7 w-7 items-center justify-center rounded-none border border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg"
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
        className="rounded-none border border-border bg-surface"
      >
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-2 border-b border-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fgMuted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by @handle or name..."
              aria-label="Search users"
              className={`${inputClasses} pr-3 pl-8`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "all" | DirectoryRole)}
              className={`${selectClasses} w-auto px-2 text-fgBody`}
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
              className={`${selectClasses} w-auto px-2 text-fgBody`}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>

            {hasFilters ? (
              <Button type="button" variant="secondary" size="md" onClick={resetFilters}>
                <X className="h-3 w-3" aria-hidden="true" />
                <span>Reset</span>
              </Button>
            ) : null}

            <span className="font-mono text-[11px] text-fgMuted">
              {filteredUsers.length} / {users.length}
            </span>
          </div>
        </div>

        {bannerError ? (
          <ErrorBanner className="mx-3.5 mt-3 px-3 py-2 text-[12px]">{bannerError}</ErrorBanner>
        ) : null}

        {filteredUsers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="m-0 text-[13px] font-medium text-fg">No matching users found</p>
            <p className="m-0 mt-1 text-[12px] text-fgMuted">
              Adjust your search query or role/status filters to see directory accounts.
            </p>
            {hasFilters ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={resetFilters}
                className="mt-3"
              >
                Reset filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border bg-canvas text-[11px] font-semibold uppercase tracking-wider text-fgMuted">
                  <th className="px-3.5 py-2.5">User / @namespace</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Role</th>
                  <th className="hidden px-3 py-2.5 sm:table-cell">Status</th>
                  <th className="hidden px-3 py-2.5 md:table-cell">Activity</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle">
                {filteredUsers.map((entry) => {
                  const canToggle = canToggleNamespaceStatus(entry);
                  const canRemove = canRemoveNamespaceEntry(entry);
                  const isBusy = busyId === entry.id;
                  const loginStatusLabel =
                    entry.isPrimaryAdmin && primaryPasswordManagedByEnv
                      ? "env / demo"
                      : entry.hasPassword
                        ? "password set"
                        : "no password";

                  return (
                    <tr key={entry.id} className="transition-colors hover:bg-surfaceHover">
                      <td className="px-3.5 py-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-fg">{entry.displayName}</span>
                            {entry.isPrimaryAdmin ? (
                              <span className="rounded-none border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-accent">
                                primary
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-fgMuted">
                            <span>@{entry.slug}</span>
                            <span>·</span>
                            <span>
                              {entry.repoCount} {entry.repoCount === 1 ? "repo" : "repos"}
                            </span>
                            <span>·</span>
                            <span
                              className={
                                !entry.isPrimaryAdmin && !entry.hasPassword
                                  ? "text-amber-400"
                                  : "text-fgMuted"
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
                              className={`inline-flex rounded-none border px-1.5 py-0.5 font-mono text-[10px] font-medium ${roleBadgeClass(entry.role)}`}
                            >
                              {entry.role}
                            </span>
                            <span
                              className={`inline-flex rounded-none border px-1.5 py-0.5 font-mono text-[10px] font-medium ${statusBadgeClass(entry.status)}`}
                            >
                              {entry.status}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <span
                          className={`inline-flex rounded-none border px-1.5 py-0.5 font-mono text-[11px] font-medium ${roleBadgeClass(entry.role)}`}
                        >
                          {entry.role}
                        </span>
                      </td>

                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <span
                          className={`inline-flex rounded-none border px-1.5 py-0.5 font-mono text-[11px] font-medium ${statusBadgeClass(entry.status)}`}
                        >
                          {entry.status}
                        </span>
                      </td>

                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <div className="flex flex-col gap-0.5 text-[11px] text-fgMuted">
                          <span>
                            Created{" "}
                            <span className="font-mono text-fgBody" suppressHydrationWarning>
                              {formatRelativeTime(entry.createdAt)}
                            </span>
                          </span>
                          <span>
                            Active{" "}
                            <span className="font-mono text-fgBody" suppressHydrationWarning>
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
                              className="inline-flex h-7 items-center gap-1 rounded-none border border-border bg-canvas px-2 text-[11px] font-medium text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg disabled:opacity-50"
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
                            className="inline-flex h-7 items-center gap-1 rounded-none border border-border bg-canvas px-2 text-[11px] font-medium text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg disabled:opacity-50"
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
                              className="inline-flex h-7 items-center gap-1 rounded-none border border-red-500/30 bg-transparent px-2 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span>Remove</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex h-7 items-center rounded-none border border-border px-2 font-mono text-[10px] text-fgMuted"
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
          primaryPasswordManagedByEnv={primaryPasswordManagedByEnv}
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
