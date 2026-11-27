export type PwaIconSpec = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

export const PWA_CACHE_NAME = "gitra-shell-v1";

export const PWA_PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
] as const;

const BYPASS_EXACT_PATHS = new Set<string>(["/auth", "/admin", "/sw.js"]);

const BYPASS_PREFIXES = [
  "/auth/",
  "/admin/",
  "/user/",
  "/api/",
  "/@vite/",
  "/@react-refresh",
  "/__vite_ping",
  "/src/",
  "/node_modules/",
] as const;

const BYPASS_GIT_SUFFIXES = [
  "/info/refs",
  "/git-upload-pack",
  "/git-receive-pack",
  "/raw",
  "/rawpath",
] as const;

/**
 * Determines whether the service worker must bypass caching and defer strictly
 * to network for a request (mutations, auth/admin endpoints, Git Smart HTTP
 * protocol endpoints, dev HMR assets, and cross-origin traffic).
 */
export function shouldBypassServiceWorker(
  pathname: string,
  method: string,
  sameOrigin = true
): boolean {
  if (!sameOrigin) return true;
  if (method.toUpperCase() !== "GET") return true;

  if (BYPASS_EXACT_PATHS.has(pathname)) return true;
  for (const prefix of BYPASS_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  for (const suffix of BYPASS_GIT_SUFFIXES) {
    if (pathname.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Classifies static PWA/asset paths suitable for stale-while-revalidate caching.
 */
export function isStaticCacheableAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/favicon.ico"
  );
}

/**
 * Validates that a parsed Web App Manifest conforms to installability baselines
 * (separate `any` and `maskable` icon entries, no combined `any maskable` purpose,
 * valid sizes).
 */
export function validateManifestIcons(icons: readonly PwaIconSpec[]): {
  ok: boolean;
  reason?: string;
} {
  const has192Any = icons.some(
    (icon) => icon.sizes.includes("192x192") && (icon.purpose ?? "any") === "any"
  );
  const has512Any = icons.some(
    (icon) => icon.sizes.includes("512x512") && (icon.purpose ?? "any") === "any"
  );
  const hasMaskable = icons.some(
    (icon) => icon.sizes.includes("512x512") && icon.purpose === "maskable"
  );
  const hasCombinedPurpose = icons.some((icon) => {
    const purpose = (icon.purpose ?? "").trim();
    return purpose.includes("any") && purpose.includes("maskable");
  });

  if (hasCombinedPurpose) {
    return { ok: false, reason: "Do not combine 'any' and 'maskable' on a single icon entry" };
  }
  if (!has192Any || !has512Any) {
    return { ok: false, reason: "Manifest must provide 192x192 and 512x512 'any' PNG icons" };
  }
  if (!hasMaskable) {
    return { ok: false, reason: "Manifest must provide a dedicated 'maskable' icon entry" };
  }
  return { ok: true };
}
