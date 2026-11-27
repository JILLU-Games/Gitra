export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type ToastInput = {
  id?: string;
  tone?: ToastTone;
  title: string;
  message?: string;
  durationMs?: number;
  action?: ToastAction;
};

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  durationMs: number;
  createdAt: number;
  action?: ToastAction;
};

export const MAX_VISIBLE_TOASTS = 5;
export const DEFAULT_TOAST_DURATION_MS = 4500;

export function resolveDefaultToastDuration(tone: ToastTone): number {
  if (tone === "error") return 6500;
  if (tone === "warning") return 5500;
  return DEFAULT_TOAST_DURATION_MS;
}

export function createToastItem(input: ToastInput, now = Date.now(), seq = 0): ToastItem {
  const tone: ToastTone = input.tone ?? "info";
  const durationMs =
    typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
      ? Math.max(0, input.durationMs)
      : resolveDefaultToastDuration(tone);
  const id = input.id?.trim() || `toast-${now}-${seq}`;
  return {
    id,
    tone,
    title: input.title,
    message: input.message?.trim() ? input.message.trim() : undefined,
    durationMs,
    createdAt: now,
    action: input.action,
  };
}

export function enqueueToastItem(
  queue: readonly ToastItem[],
  next: ToastItem,
  maxVisible = MAX_VISIBLE_TOASTS
): ToastItem[] {
  const withoutDuplicate = queue.filter((item) => item.id !== next.id);
  const updated = [...withoutDuplicate, next];
  if (updated.length <= maxVisible) {
    return updated;
  }
  return updated.slice(updated.length - maxVisible);
}

export function dismissToastItem(queue: readonly ToastItem[], id: string): ToastItem[] {
  return queue.filter((item) => item.id !== id);
}

export function formatClipboardFailureMessage(label?: string): string {
  const target = label?.trim() ? label.trim() : "text";
  return `Clipboard access is blocked or unavailable in this browser context. Select and copy the ${target} manually.`;
}
