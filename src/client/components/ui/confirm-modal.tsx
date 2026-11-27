/// <reference lib="dom" />

import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { Button } from "./button";

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  requireText?: string;
  requireTextLabel?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  requireText,
  requireTextLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [typedText, setTypedText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTypedText("");
      setLocalError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const phraseMismatch = Boolean(requireText && typedText !== requireText);
  const displayError = error ?? localError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (requireText && typedText !== requireText) {
      setLocalError(`Type "${requireText}" exactly to continue.`);
      return;
    }
    setLocalError(null);
    await onConfirm();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-md rounded-none border border-border bg-surface"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 id="confirm-modal-title" className="m-0 text-[14px] font-semibold text-fg">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close confirmation dialog"
            className="inline-flex h-7 w-7 items-center justify-center rounded-none border border-transparent text-fgMuted hover:bg-surfaceHover hover:text-fg disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3.5 p-4">
          <p className="m-0 whitespace-pre-line text-[13px] leading-relaxed text-fgBody">
            {description}
          </p>

          {requireText ? (
            <div>
              <label
                htmlFor="confirm-modal-phrase"
                className="mb-1 block text-[12px] font-medium text-fgBody"
              >
                {requireTextLabel ?? (
                  <>
                    Type <code className="font-mono text-fg">{requireText}</code> to confirm
                  </>
                )}
              </label>
              <input
                id="confirm-modal-phrase"
                type="text"
                autoFocus
                value={typedText}
                onChange={(event) => {
                  setTypedText(event.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder={requireText}
                className="h-8 w-full rounded-none border border-border bg-canvas px-2.5 font-mono text-[12px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none"
              />
            </div>
          ) : null}

          {displayError ? (
            <p
              role="alert"
              className="m-0 rounded-none border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400"
            >
              {displayError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button type="submit" variant={variant} size="sm" disabled={busy || phraseMismatch}>
              {busy ? "Processing…" : confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
