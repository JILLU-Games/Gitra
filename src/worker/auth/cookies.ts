import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

import type { AppContext } from "@/worker/routes/hono";

// Hono's `host` prefix option serializes HTTPS session cookies with the `__Host-`
// prefix, enforcing `Secure`, `Path=/`, and no `Domain` on the wire, plus
// `SameSite=None; Partitioned` (CHIPS) for cross-site preview iframes.
// On plain HTTP deployments without an HTTPS reverse proxy, browsers silently
// reject `Secure` cookies on non-loopback hosts, so fall back to `HttpOnly;
// SameSite=Lax; Path=/` without `__Host-`/`Secure`.
export const AUTH_COOKIE_PREFIX = "host";
export const SESSION_COOKIE_NAME = "goc_session";
export const SESSION_COOKIE_HEADER_NAME = `__Host-${SESSION_COOKIE_NAME}`;

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const HTTPS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  partitioned: true,
  prefix: AUTH_COOKIE_PREFIX,
} as const satisfies CookieOptions;

const PLAIN_HTTP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false,
  sameSite: "Lax",
  path: "/",
} as const satisfies CookieOptions;

export function isHttpsSessionContext(
  requestUrl: string,
  headers?: { forwardedProto?: string; origin?: string }
): boolean {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.protocol === "https:") return true;
  } catch {
    // Fall through to proxy/origin header checks.
  }
  const forwardedProto = headers?.forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto === "https") return true;
  const origin = headers?.origin?.trim().toLowerCase();
  if (origin?.startsWith("https://")) return true;
  return false;
}

function isRequestHttps(c: AppContext): boolean {
  return isHttpsSessionContext(c.req.url, {
    forwardedProto: c.req.header("x-forwarded-proto"),
    origin: c.req.header("origin"),
  });
}

export function setSessionCookie(c: AppContext, opaqueToken: string): void {
  const baseOptions = isRequestHttps(c) ? HTTPS_COOKIE_OPTIONS : PLAIN_HTTP_COOKIE_OPTIONS;
  setCookie(c, SESSION_COOKIE_NAME, opaqueToken, {
    ...baseOptions,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function getSessionCookie(c: AppContext): string | undefined {
  return (
    getCookie(c, SESSION_COOKIE_NAME, AUTH_COOKIE_PREFIX) ?? getCookie(c, SESSION_COOKIE_NAME)
  );
}

export function clearSessionCookie(c: AppContext): void {
  if (isRequestHttps(c)) {
    deleteCookie(c, SESSION_COOKIE_NAME, HTTPS_COOKIE_OPTIONS);
    return;
  }
  deleteCookie(c, SESSION_COOKIE_NAME, PLAIN_HTTP_COOKIE_OPTIONS);
}
