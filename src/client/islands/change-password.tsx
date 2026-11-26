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
  passwordManagedByEnv?: boolean;
};

type ChangePasswordErrorReason =
  | "invalid-payload"
  | "invalid-current-password"
  | "password-too-short"
  | "password-too-long"
  | "managed-by-env"
  | "primary-admin-managed-by-env"
  | "password-not-set"
  | "no-password-set"
  | "rate-limited"
  | "not-found";

function describeChangePasswordError(reason?: string): string {
  switch (reason as ChangePasswordErrorReason | undefined) {
    case "invalid-current-password":
      return "Your current password is incorrect. Try again.";
    case "password-too-short":
      return `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    case "password-too-long":
      return `New password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    case "managed-by-env":
    case "primary-admin-managed-by-env":
      return "Primary administrator password is managed via ADMIN_PASSWORD or Demo Mode.";
    case "password-not-set":
    case "no-password-set":
      return "No password is set for this account. Ask an administrator to set one in Users.";
    case "rate-limited":
      return "Too many password update attempts. Wait a few minutes and try again.";
    default:
      return "Could not update password. Please check your inputs and try again.";
  }
}

export function ChangePasswordIsland({
  isPrimaryAdmin,
  hasPassword,
  passwordManagedByEnv = true,
}: ChangePasswordIslandProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (isPrimaryAdmin && passwordManagedByEnv) {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-4 py-3 text-[12px] text-fgBody">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fgMuted" aria-hidden="true" />
        <div>
          <p className="m-0 font-semibold text-fg">Managed by environment configuration</p>
          <p className="m-0 mt-0.5 leading-relaxed">
            Primary admin sign-in uses <span className="font-mono text-fg">ADMIN_PASSWORD</span> (or
            Live Preview demo credentials when unset). Directory account passwords are managed
            inside Site Administration.
          </p>
        </div>
      </div>
    );
  }

  if (!hasPassword) {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-4 py-3 text-[12px] text-fgBody">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-fgMuted" aria-hidden="true" />
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
    <div className="rounded-md border border-border bg-surface p-4">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[14px] font-semibold text-fg">Change password</h3>
            <p className="m-0 mt-0.5 text-[12px] text-fgMuted">
              Update your sign-in password ({PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswords((prev) => !prev)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-2.5 text-[12px] font-medium text-fgBody hover:bg-surfaceHover hover:text-fg"
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
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
          >
            {error}
          </div>
        ) : null}

        {saved ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300"
          >
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Password updated. Use your new password the next time you sign in.</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="account-current-password"
              className="mb-1 block text-[12px] font-medium text-fg"
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
              className="h-8 w-full rounded-md border border-border bg-canvas px-3 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="account-new-password"
              className="mb-1 block text-[12px] font-medium text-fg"
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
              className="h-8 w-full rounded-md border border-border bg-canvas px-3 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="account-confirm-password"
              className="mb-1 block text-[12px] font-medium text-fg"
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
              className="h-8 w-full rounded-md border border-border bg-canvas px-3 font-mono text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-fg px-3.5 text-[12px] font-semibold text-canvas transition-colors hover:bg-fgHover disabled:opacity-50"
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
