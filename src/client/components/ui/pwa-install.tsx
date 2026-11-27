/// <reference lib="dom" />

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, WifiOff, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_BUS_KEY = Symbol.for("gitra.pwaInstallPrompt");

type GlobalWithInstall = typeof globalThis & {
  [INSTALL_BUS_KEY]?: BeforeInstallPromptEvent | null;
};

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  const matchStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return matchStandalone || navigatorStandalone;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

export function PwaShellControls() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => (globalThis as GlobalWithInstall)[INSTALL_BUS_KEY] ?? null
  );
  const [standalone, setStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [offline, setOffline] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplayMode());
    setIsIos(isIosDevice());
    setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      (globalThis as GlobalWithInstall)[INSTALL_BUS_KEY] = promptEvent;
      setDeferredPrompt(promptEvent);
    }

    function onAppInstalled() {
      (globalThis as GlobalWithInstall)[INSTALL_BUS_KEY] = null;
      setDeferredPrompt(null);
      setStandalone(true);
    }

    function onOnline() {
      setOffline(false);
    }

    function onOffline() {
      setOffline(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        (globalThis as GlobalWithInstall)[INSTALL_BUS_KEY] = null;
        setDeferredPrompt(null);
      }
      return;
    }
    if (isIos) {
      setIosGuideOpen(true);
    }
  }

  const canOfferInstall = !standalone && (Boolean(deferredPrompt) || isIos);

  if (!offline && !canOfferInstall && !iosGuideOpen) {
    return null;
  }

  return (
    <>
      {offline ? (
        <span
          role="status"
          className="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
        >
          <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Offline Mode</span>
        </span>
      ) : null}

      {canOfferInstall ? (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="inline-flex h-6 items-center gap-1.5 border border-border bg-canvas px-2 text-[11px] font-medium text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          <span>Install App</span>
        </button>
      ) : null}

      {iosGuideOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-ios-install-title"
          className="fixed inset-0 z-[210] flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-xs"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIosGuideOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm border border-border bg-surface p-4 text-[12px] text-fg">
            <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
              <h3 id="pwa-ios-install-title" className="m-0 text-[13px] font-semibold text-fg">
                Install App on iOS
              </h3>
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                aria-label="Close install instructions"
                className="inline-flex h-6 w-6 items-center justify-center border border-border bg-canvas text-fgMuted hover:bg-surfaceHover hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="m-0 text-[12px] leading-relaxed text-fgBody">
              Tap the <strong className="text-fg">Share</strong> button in Safari and select{" "}
              <strong className="text-fg">Add to Home Screen</strong> to launch in standalone mode.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function initPwaShell(): void {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker registration is progressive; ignore errors in unsupported contexts.
    });
  }

  const slot = document.querySelector<HTMLElement>("[data-pwa-install-slot]");
  if (!slot || slot.dataset.pwaMounted === "true") {
    return;
  }
  slot.dataset.pwaMounted = "true";
  createRoot(slot).render(<PwaShellControls />);
}
