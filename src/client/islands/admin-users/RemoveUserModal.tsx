/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { AdminNamespaceEntry } from "@/shared/admin/panel";

type RemoveUserModalProps = {
  user: AdminNamespaceEntry;
  onClose: () => void;
  onRemoved: (userId: string) => void;
};

export function RemoveUserModal({ user, onClose, onRemoved }: RemoveUserModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function handleConfirmRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.reason === "cannot-remove-admin"
            ? "The signed-in primary admin account cannot be removed."
            : "Could not remove user."
        );
        return;
      }
      onRemoved(user.id);
      onClose();
    } catch {
      setError("Network error while removing user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-user-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="remove-user-modal-title"
            className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Remove user
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}

          <p className="m-0 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            Permanently remove{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">{user.displayName}</strong> (
            <span className="font-mono text-zinc-900 dark:text-zinc-100">@{user.slug}</span>)? This
            deletes the namespace record, memberships, and scoped grants immediately.
            {user.repoCount > 0
              ? ` This namespace currently holds ${user.repoCount} ${user.repoCount === 1 ? "repository" : "repositories"}.`
              : ""}
          </p>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-md border border-red-600 bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Removing..." : "Remove user"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
