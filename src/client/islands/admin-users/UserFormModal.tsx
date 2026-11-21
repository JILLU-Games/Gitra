/// <reference lib="dom" />

import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, RefreshCw, ShieldAlert, X } from "lucide-react";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  generateTemporaryPassword,
  validateUserPassword,
  type AdminNamespaceEntry,
  type DirectoryRole,
  type DirectoryStatus,
} from "@/shared/admin/panel";

type UserFormModalProps = {
  mode: "create" | "edit";
  initialUser?: AdminNamespaceEntry | null;
  onClose: () => void;
  onCreated: (user: AdminNamespaceEntry, issuedPassword?: string) => void;
  onUpdated: (user: AdminNamespaceEntry, issuedPassword?: string) => void;
};

type ApiErrorReason =
  | "invalid-handle"
  | "reserved-handle"
  | "handle-taken"
  | "password-too-short"
  | "password-too-long"
  | "protected-admin"
  | "invalid-payload"
  | "not-found";

function errorMessageForReason(reason?: string): string {
  switch (reason as ApiErrorReason | undefined) {
    case "invalid-handle":
      return "Handle must be 1–40 lowercase letters, numbers, or internal hyphens.";
    case "reserved-handle":
      return "That handle is reserved by the platform.";
    case "handle-taken":
      return "That handle is already in use by another account.";
    case "password-too-short":
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    case "password-too-long":
      return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    case "protected-admin":
      return "The signed-in primary admin's handle, role, status, and env password are locked.";
    case "not-found":
      return "User record could not be found.";
    default:
      return "Could not save user changes. Please verify the inputs and try again.";
  }
}

export function UserFormModal({
  mode,
  initialUser,
  onClose,
  onCreated,
  onUpdated,
}: UserFormModalProps) {
  const isEdit = mode === "edit" && Boolean(initialUser);
  const isPrimaryAdmin = isEdit && Boolean(initialUser?.isPrimaryAdmin);

  const [handle, setHandle] = useState(initialUser?.slug ?? "");
  const [displayName, setDisplayName] = useState(initialUser?.displayName ?? "");
  const [role, setRole] = useState<DirectoryRole>(initialUser?.role ?? "member");
  const [status, setStatus] = useState<DirectoryStatus>(initialUser?.status ?? "active");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  function handleGeneratePassword() {
    setPassword(generateTemporaryPassword(16));
    setShowPassword(true);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanedHandle = handle.trim().replace(/^@+/, "");
    if (!isPrimaryAdmin && !cleanedHandle) {
      setError("Username / @namespace handle is required.");
      return;
    }

    if (!isEdit) {
      const pwCheck = validateUserPassword(password);
      if (!pwCheck.ok) {
        setError(
          pwCheck.reason === "too-short"
            ? `Initial password must be at least ${PASSWORD_MIN_LENGTH} characters.`
            : `Initial password must be at most ${PASSWORD_MAX_LENGTH} characters.`
        );
        return;
      }
    } else if (!isPrimaryAdmin && password.length > 0) {
      const pwCheck = validateUserPassword(password);
      if (!pwCheck.ok) {
        setError(
          pwCheck.reason === "too-short"
            ? `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`
            : `New password must be at most ${PASSWORD_MAX_LENGTH} characters.`
        );
        return;
      }
    }

    setBusy(true);
    try {
      if (!isEdit) {
        const res = await fetch("/admin/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handle: cleanedHandle,
            displayName: displayName.trim(),
            role,
            status,
            password,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reason?: string;
          user?: AdminNamespaceEntry;
        };
        if (!res.ok || !data.ok || !data.user) {
          setError(errorMessageForReason(data.reason));
          return;
        }
        onCreated(data.user, password);
        onClose();
        return;
      }

      if (!initialUser) return;
      const payload: {
        handle?: string;
        displayName: string;
        role?: DirectoryRole;
        status?: DirectoryStatus;
        password?: string;
      } = {
        displayName: displayName.trim(),
      };
      if (!isPrimaryAdmin) {
        payload.handle = cleanedHandle;
        payload.role = role;
        payload.status = status;
        if (password.length > 0) {
          payload.password = password;
        }
      }

      const res = await fetch(`/admin/api/users/${encodeURIComponent(initialUser.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        slug?: string;
        displayName?: string;
        role?: DirectoryRole;
        status?: DirectoryStatus;
        lastActiveAt?: number;
        hasPassword?: boolean;
      };
      if (!res.ok || !data.ok) {
        setError(errorMessageForReason(data.reason));
        return;
      }

      onUpdated(
        {
          ...initialUser,
          slug: data.slug ?? initialUser.slug,
          displayName: data.displayName ?? initialUser.displayName,
          role: data.role ?? initialUser.role,
          status: data.status ?? initialUser.status,
          lastActiveAt: data.lastActiveAt ?? initialUser.lastActiveAt,
          hasPassword: data.hasPassword ?? initialUser.hasPassword,
        },
        !isPrimaryAdmin && password.length > 0 ? password : undefined
      );
      onClose();
    } catch {
      setError("Network error while saving user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-form-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2
              id="user-form-modal-title"
              className="m-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {isEdit ? `Edit @${initialUser?.slug}` : "Add user"}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {isEdit
                ? "Update account details or assign a new password."
                : "Create a user account, namespace, and initial sign-in password."}
            </p>
          </div>
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

        <form onSubmit={handleSubmit} className="space-y-3.5 p-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}

          {isPrimaryAdmin ? (
            <div className="flex items-start gap-2 rounded-md border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-xs text-accent-800 dark:text-accent-300">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                You are editing the signed-in primary admin. Display name can be updated; handle,
                role, active status, and env password remain locked.
              </span>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="user-form-handle"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Username / @namespace
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-zinc-400"
              >
                @
              </span>
              <input
                id="user-form-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                disabled={busy || isPrimaryAdmin}
                placeholder="jane-ops"
                autoComplete="off"
                autoFocus={!isPrimaryAdmin}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white pr-3 pl-6 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-500"
              />
            </div>
            <p className="m-0 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Lowercase letters, numbers, and hyphens (1–40 characters).
            </p>
          </div>

          <div>
            <label
              htmlFor="user-form-display-name"
              className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Display name
            </label>
            <input
              id="user-form-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
              placeholder="Jane Morales"
              maxLength={80}
              autoFocus={isPrimaryAdmin}
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="user-form-role"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role
              </label>
              <select
                id="user-form-role"
                value={role}
                onChange={(e) => setRole(e.target.value as DirectoryRole)}
                disabled={busy || isPrimaryAdmin}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="user-form-status"
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Status
              </label>
              <select
                id="user-form-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DirectoryStatus)}
                disabled={busy || isPrimaryAdmin}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:bg-zinc-900"
              >
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </div>
          </div>

          {!isPrimaryAdmin ? (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="user-form-password"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  {isEdit ? "Reset password (optional)" : "Initial password"}
                </label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  disabled={busy}
                  className="inline-flex h-6 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  <span>Generate</span>
                </button>
              </div>
              <div className="relative">
                <input
                  id="user-form-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  minLength={isEdit ? undefined : PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  required={!isEdit}
                  placeholder={
                    isEdit
                      ? "Leave blank to keep current password"
                      : `Min ${PASSWORD_MIN_LENGTH} characters`
                  }
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white pr-9 pl-3 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={busy}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-1.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="m-0 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {isEdit
                  ? "Enter 8–128 characters to replace this user's password immediately."
                  : "Stored securely hashed (PBKDF2-SHA256) and shown once after creation."}
              </p>
            </div>
          ) : null}

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
              type="submit"
              disabled={busy}
              className="inline-flex h-8 items-center rounded-md border border-accent-600 bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy ? "Saving..." : isEdit ? "Save changes" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
