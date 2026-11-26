import type { AppContext } from "@/worker/routes/hono";

const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function firstHeaderValue(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first ? first : null;
}

function parseForwardedHost(forwardedHeader: string | undefined): string | null {
  const first = firstHeaderValue(forwardedHeader);
  if (!first) return null;
  const match = /(?:^|;\s*)host="?([^";\s]+)"?/i.exec(first);
  return match?.[1] ?? null;
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export type OriginCheckHeaders = {
  forwardedHost?: string;
  forwardedProto?: string;
  forwarded?: string;
  host?: string;
  secFetchSite?: string;
  referer?: string;
};

export function isAllowedOrigin(
  originHeader: string | undefined,
  requestUrl: string,
  headers?: OriginCheckHeaders
): boolean {
  if (!originHeader) return false;

  let originUrl: URL;
  let parsedRequestUrl: URL;
  try {
    originUrl = new URL(originHeader);
    parsedRequestUrl = new URL(requestUrl);
  } catch {
    return false;
  }

  if (originUrl.protocol !== "https:" && originUrl.protocol !== "http:") {
    return false;
  }

  if (originUrl.origin === parsedRequestUrl.origin) {
    return true;
  }

  // Support reverse-proxied deployments (such as Cloud Run / Live Preview)
  // where TLS terminates upstream and forwards the public hostname via
  // X-Forwarded-Host, Forwarded, or Host while the Worker sees an internal
  // HTTP request URL.
  const forwardedHost =
    firstHeaderValue(headers?.forwardedHost) ?? parseForwardedHost(headers?.forwarded);
  const host = firstHeaderValue(headers?.host);
  const forwardedProto = firstHeaderValue(headers?.forwardedProto)?.toLowerCase();
  const effectiveProto =
    forwardedProto === "https" || forwardedProto === "http"
      ? `${forwardedProto}:`
      : parsedRequestUrl.protocol;

  for (const candidateHost of [forwardedHost, host]) {
    if (!candidateHost) continue;
    if (/[\s/@]/.test(candidateHost)) continue;
    if (originUrl.host.toLowerCase() !== candidateHost.toLowerCase()) continue;
    if (originUrl.protocol === effectiveProto) {
      return true;
    }
    // Allow HTTPS origin over an internal HTTP reverse-proxy hop where TLS
    // terminated upstream (even if an intermediate hop omitted or reset
    // X-Forwarded-Proto to http), while still rejecting HTTP downgrades.
    if (
      parsedRequestUrl.protocol === "http:" &&
      effectiveProto === "http:" &&
      originUrl.protocol === "https:"
    ) {
      return true;
    }
  }

  // Fallback for local/preview reverse proxies that rewrite `Host` to loopback
  // (`localhost:3000`) and omit `X-Forwarded-Host`: accept only when the
  // browser-enforced forbidden header `Sec-Fetch-Site: same-origin` is present
  // with an HTTPS Origin (and matching Referer origin if Referer is sent).
  const secFetchSite = firstHeaderValue(headers?.secFetchSite)?.toLowerCase();
  if (
    secFetchSite === "same-origin" &&
    parsedRequestUrl.protocol === "http:" &&
    isLoopbackHostname(parsedRequestUrl.hostname) &&
    originUrl.protocol === "https:"
  ) {
    const refererHeader = firstHeaderValue(headers?.referer);
    if (!refererHeader) {
      return true;
    }
    try {
      return new URL(refererHeader).origin === originUrl.origin;
    } catch {
      return false;
    }
  }

  return false;
}

// Returns a 403 Response if a non-safe method lacks an Origin header that
// matches the effective request origin. Explicit Origin verification protects
// cookie-authenticated mutating routes (login, sign-out, repository/PAT/admin
// mutations) even when partitioned SameSite=None cookies are used in previews.
export function sameOriginViolation(c: AppContext): Response | null {
  if (SAFE_METHODS.has(c.req.method)) return null;
  const origin = c.req.header("origin");
  const forwardedHost = c.req.header("x-forwarded-host");
  const forwardedProto = c.req.header("x-forwarded-proto");
  const forwarded = c.req.header("forwarded");
  const host = c.req.header("host");
  const secFetchSite = c.req.header("sec-fetch-site");
  const referer = c.req.header("referer");

  const allowed = isAllowedOrigin(origin, c.req.url, {
    forwardedHost,
    forwardedProto,
    forwarded,
    host,
    secFetchSite,
    referer,
  });
  if (!allowed) {
    c.var.logFor?.({ service: "OriginCheck" }).warn("csrf:same-origin-rejected", {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      origin: origin ?? null,
      host: host ?? null,
      forwardedHost: forwardedHost ?? null,
      forwardedProto: forwardedProto ?? null,
      secFetchSite: secFetchSite ?? null,
    });
    return new Response("Forbidden\n", { status: 403 });
  }
  return null;
}
