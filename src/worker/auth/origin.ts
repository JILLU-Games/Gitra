import type { AppContext } from "@/worker/routes/hono";

const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

function firstHeaderValue(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first ? first : null;
}

export function isAllowedOrigin(
  originHeader: string | undefined,
  requestUrl: string,
  headers?: {
    forwardedHost?: string;
    forwardedProto?: string;
    host?: string;
  }
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

  if (originUrl.origin === parsedRequestUrl.origin) {
    return true;
  }

  // Support reverse-proxied deployments (such as Live Preview) where TLS
  // terminates upstream and forwards the public hostname via X-Forwarded-Host
  // or Host while the Worker sees an internal HTTP request URL.
  const forwardedHost = firstHeaderValue(headers?.forwardedHost);
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
  }

  return false;
}

// Returns a 403 Response if a non-safe method lacks an Origin header that
// matches the effective request origin. Explicit Origin verification protects
// cookie-authenticated mutating routes (login, sign-out, repository/PAT/admin
// mutations) even when partitioned SameSite=None cookies are used in previews.
export function sameOriginViolation(c: AppContext): Response | null {
  if (SAFE_METHODS.has(c.req.method)) return null;
  const allowed = isAllowedOrigin(c.req.header("origin"), c.req.url, {
    forwardedHost: c.req.header("x-forwarded-host"),
    forwardedProto: c.req.header("x-forwarded-proto"),
    host: c.req.header("host"),
  });
  if (!allowed) {
    return new Response("Forbidden\n", { status: 403 });
  }
  return null;
}
