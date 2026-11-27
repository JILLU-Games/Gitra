/// <reference lib="dom" />

import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import {
  createToastItem,
  dismissToastItem,
  enqueueToastItem,
  formatClipboardFailureMessage,
  type ToastInput,
  type ToastItem,
  type ToastTone,
} from "@/shared/toast";

export type { ToastAction, ToastInput, ToastItem, ToastTone } from "@/shared/toast";

type ToastListener = (items: readonly ToastItem[]) => void;

type ToastBus = {
  items: ToastItem[];
  seq: number;
  listeners: Set<ToastListener>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
};

const GLOBAL_BUS_SYMBOL = Symbol.for("gitra.globalToastBus");

type GlobalWithToastBus = typeof globalThis & {
  [GLOBAL_BUS_SYMBOL]?: ToastBus;
};

function getToastBus(): ToastBus {
  const root = globalThis as GlobalWithToastBus;
  if (!root[GLOBAL_BUS_SYMBOL]) {
    root[GLOBAL_BUS_SYMBOL] = {
      items: [],
      seq: 0,
      listeners: new Set<ToastListener>(),
      timers: new Map(),
    };
  }
  return root[GLOBAL_BUS_SYMBOL];
}

function notifyListeners(bus: ToastBus): void {
  const snapshot = [...bus.items];
  for (const listener of bus.listeners) {
    listener(snapshot);
  }
}

export function dismissToast(id: string): void {
  const bus = getToastBus();
  const timer = bus.timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    bus.timers.delete(id);
  }
  const next = dismissToastItem(bus.items, id);
  if (next.length !== bus.items.length) {
    bus.items = next;
    notifyListeners(bus);
  }
}

export function clearAllToasts(): void {
  const bus = getToastBus();
  for (const timer of bus.timers.values()) {
    clearTimeout(timer);
  }
  bus.timers.clear();
  if (bus.items.length > 0) {
    bus.items = [];
    notifyListeners(bus);
  }
}

export function showToast(input: ToastInput): string {
  const bus = getToastBus();
  bus.seq += 1;
  const item = createToastItem(input, Date.now(), bus.seq);
  const existingTimer = bus.timers.get(item.id);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
    bus.timers.delete(item.id);
  }
  bus.items = enqueueToastItem(bus.items, item);
  notifyListeners(bus);

  if (item.durationMs > 0 && typeof setTimeout === "function") {
    const timer = setTimeout(() => {
      dismissToast(item.id);
    }, item.durationMs);
    bus.timers.set(item.id, timer);
  }
  return item.id;
}

export type CopyToClipboardOptions = {
  label?: string;
  successTitle?: string;
  successMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
};

/**
 * Copies text via `navigator.clipboard.writeText` and always provides
 * global toast feedback on both success and restricted-context failure.
 */
export async function copyToClipboard(
  text: string,
  options?: CopyToClipboardOptions
): Promise<boolean> {
  const label = options?.label ?? "value";
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    showToast({
      tone: "success",
      title: options?.successTitle ?? `Copied ${label}`,
      message: options?.successMessage,
      durationMs: 2800,
    });
    return true;
  } catch {
    showToast({
      tone: "error",
      title: options?.errorTitle ?? "Clipboard unavailable",
      message: options?.errorMessage ?? formatClipboardFailureMessage(label),
      durationMs: 5500,
    });
    return false;
  }
}

function toneFrameClasses(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "border-border border-l-2 border-l-emerald-400 bg-surface text-fg";
    case "error":
      return "border-red-500/40 border-l-2 border-l-red-400 bg-surface text-fg";
    case "warning":
      return "border-amber-500/40 border-l-2 border-l-amber-400 bg-surface text-fg";
    default:
      return "border-border border-l-2 border-l-accent bg-surface text-fg";
  }
}

function ToneIcon({ tone }: { tone: ToastTone }) {
  switch (tone) {
    case "success":
      return (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
      );
    case "error":
      return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />;
    case "warning":
      return (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      );
    default:
      return <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />;
  }
}

export function ToastViewport() {
  const [items, setItems] = useState<readonly ToastItem[]>(() => [...getToastBus().items]);

  useEffect(() => {
    const bus = getToastBus();
    const listener: ToastListener = (next) => {
      setItems(next);
    };
    bus.listeners.add(listener);
    setItems([...bus.items]);
    return () => {
      bus.listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[220] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[22rem]"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          data-toast-tone={item.tone}
          className={`pointer-events-auto flex items-start gap-2.5 border p-3 text-[12px] ${toneFrameClasses(item.tone)}`}
        >
          <ToneIcon tone={item.tone} />
          <div className="min-w-0 flex-1">
            <p className="m-0 font-semibold leading-snug text-fg">{item.title}</p>
            {item.message ? (
              <p className="m-0 mt-0.5 break-words text-[12px] leading-snug text-fgBody">
                {item.message}
              </p>
            ) : null}
            {item.action ? (
              <div className="mt-2">
                {item.action.href ? (
                  <a
                    href={item.action.href}
                    className="inline-flex h-6 items-center border border-border bg-canvas px-2 text-[11px] font-medium text-fg no-underline hover:bg-surfaceHover"
                  >
                    {item.action.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      item.action?.onClick?.();
                      dismissToast(item.id);
                    }}
                    className="inline-flex h-6 items-center border border-border bg-canvas px-2 text-[11px] font-medium text-fg hover:bg-surfaceHover"
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Dismiss notification"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-transparent text-fgMuted hover:bg-surfaceHover hover:text-fg"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}

export function mountGlobalToastViewport(): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById("goc-toast-viewport");
  if (existing && existing.dataset.toastMounted === "true") {
    return;
  }
  const container = existing ?? document.createElement("div");
  container.id = "goc-toast-viewport";
  container.dataset.toastMounted = "true";
  if (!existing) {
    document.body.appendChild(container);
  }
  createRoot(container).render(<ToastViewport />);
}
