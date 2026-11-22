/// <reference lib="dom" />

import { useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateUserPassword,
} from "@/shared/admin/panel";
import { hydrateIsland } from "@/client/hydrate";

export type ChangePasswordIslandProps = {
  isPrimaryAdmin: boolean;
  hasPassword: boolean;
};

type ChangePasswordErrorReason =
  | "invalid-payload"
  | "invalid-current-password"
  | "password-too-short"
  | "password-too-long"
  | "primary-admin-managed-by-env"
  | "no-password-set"
  | "not-found";

function describeChangePasswordError(reason?: string): string {
  switch (reason as ChangePasswordErrorReason | undefined) {
    case "invalid-current-password":
      return "Your current password is incorrect. Try again.";
    case "password-too-short":
      return `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    case "password-too-long":
      return `New password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    case "primary-admin-managed-by-env":
      return "Primary administrator password is managed via ADMIN_PASSWORD or Demo Mode.";
    case "no-password-set":
      return "No password is set for this account. Ask an administrator to set one in Users.";
    default:
      return "Could not update password. Please check your inputs and try again.";
  }
}

export function ChangePasswordIsland({ isPrimaryAdmin, hasPassword }: ChangePasswordIslandProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (isPrimaryAdmin) {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400"
          aria-hidden="true"
        />
        <div>
          <p className="m-0 font-medium text-zinc-900 dark:text-zinc-100">
            Managed by environment configuration
          </p>
          <p className="m-0 mt-0.5 leading-relaxed">
            Primary admin sign-in uses <span className="font-mono">ADMIN_PASSWORD</span> (or Live
            Preview demo credentials when unset). Directory account passwords are managed inside
            Site Administration.
          </p>
        </div>
      </div>
    );
  }

  if (!hasPassword) {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
        <p className="m-0 leading-relaxed">
          No local password is set for this account yet. Ask an administrator to assign an initial
          password.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }

    const validation = validateUserPassword(newPassword);
    if (!validation.ok) {
      setError(
        validation.reason === "too-short"
          ? `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`
          : `New password must be at most ${PASSWORD_MAX_LENGTH} characters.`
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("Choose a new password that differs from your current password.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/auth/api/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
      };
      if (!res.ok || !body.ok) {
        setError(describeChangePasswordError(body.reason));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch {
      setError("Network error while updating password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Change password
            </h3>
            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Update your sign-in password ({PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords((prev) => !prev)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {showPasswords ? (
              <>
                <EyeOff className="h-3 w-3" aria-hidden="true" />
                <span>Hide</span>
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" aria-hidden="true" />
                <span>Show</span>
              </>
            )}
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        ) : null}

        {saved ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300"
          >
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Password updated. Use your new password the next time you sign in.</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="account-current-password"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Current password
            </label>
            <input
              id="account-current-password"
              type={showPasswords ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={busy}
              autoComplete="current-password"
              required
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="account-new-password"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              New password
            </label>
            <input
              id="account-new-password"
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              required
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="account-confirm-password"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Confirm new password
            </label>
            <input
              id="account-confirm-password"
              type={showPasswords ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              required
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-600 bg-accent-600 px-3 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{busy ? "Updating..." : "Update password"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function initChangePasswordIsland() {
  hydrateIsland<ChangePasswordIslandProps>("change-password", ChangePasswordIsland);
}
