/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { AdminNamespaceEntry } from "@/shared/admin/panel";
import { Button, ErrorBanner } from "@/client/components/ui";

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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-user-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-none border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="remove-user-modal-title" className="m-0 text-[14px] font-semibold text-fg">
            Remove user
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
            className="inline-flex h-7 w-7 items-center justify-center rounded-none border border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {error ? <ErrorBanner className="px-3 py-2 text-[12px]">{error}</ErrorBanner> : null}

          <p className="m-0 text-[13px] leading-relaxed text-fgBody">
            Permanently remove <strong className="text-fg">{user.displayName}</strong> (
            <span className="font-mono text-fg">@{user.slug}</span>)? This deletes the namespace
            record, memberships, and scoped grants immediately.
            {user.repoCount > 0
              ? ` This namespace currently holds ${user.repoCount} ${user.repoCount === 1 ? "repository" : "repositories"}.`
              : ""}
          </p>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" size="md" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-none border border-red-500/40 bg-red-500/15 px-3 text-[12px] font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-50"
            >
              {busy ? "Removing..." : "Remove user"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
