import { SESSION_COOKIE_HEADER_NAME } from "@/worker/auth/cookies";

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE_HEADER_NAME}=${token}`;
}

export function extractSessionToken(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const pattern = new RegExp(`${SESSION_COOKIE_HEADER_NAME}=(goc_sess_[^;]+)`);
  return pattern.exec(setCookieHeader)?.[1] ?? null;
}
