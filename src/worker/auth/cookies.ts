import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

import type { AppContext } from "@/worker/routes/hono";

// Hono's `host` prefix option serializes the session cookie with the `__Host-`
// prefix, enforcing `Secure`, `Path=/`, and no `Domain` on the wire.
// `SameSite=None; Partitioned` (CHIPS) allows the session cookie to function
// reliably inside cross-site preview iframes while keeping storage partitioned
// per top-level site, alongside explicit same-origin CSRF checks on mutations.
export const AUTH_COOKIE_PREFIX = "host";
export const SESSION_COOKIE_NAME = "goc_session";
export const SESSION_COOKIE_HEADER_NAME = `__Host-${SESSION_COOKIE_NAME}`;

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const SHARED_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
  partitioned: true,
  prefix: AUTH_COOKIE_PREFIX,
} as const satisfies CookieOptions;

export function setSessionCookie(c: AppContext, opaqueToken: string): void {
  setCookie(c, SESSION_COOKIE_NAME, opaqueToken, {
    ...SHARED_COOKIE_OPTIONS,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function getSessionCookie(c: AppContext): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME, AUTH_COOKIE_PREFIX);
}

export function clearSessionCookie(c: AppContext): void {
  deleteCookie(c, SESSION_COOKIE_NAME, SHARED_COOKIE_OPTIONS);
}
