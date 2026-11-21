import { validateSlugForRoute } from "@/shared/slugs";

/**
 * Local administrator authentication for the web dashboard.
 *
 * Deployment model:
 * - When `ADMIN_PASSWORD` is configured in the Worker environment (via
 *   `wrangler secret put ADMIN_PASSWORD` or `.dev.vars`), the app runs in
 *   `configured` mode and only accepts that credential pair. Passwordless
 *   Quick Demo Login is disabled.
 * - When `ADMIN_PASSWORD` is unset (such as Live Preview / local mock mode),
 *   the app runs in `demo` mode with default credentials `admin` / `admin123`
 *   and enables the one-click "Quick Demo Login" button on `/auth`.
 */

export const DEFAULT_DEMO_ADMIN_USERNAME = "admin";
export const DEFAULT_DEMO_ADMIN_PASSWORD = "admin123";
export const DEFAULT_POST_LOGIN_REDIRECT = "/";

export type AdminAuthEnv = {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
};

export type AdminAuthMode = "demo" | "configured";

export interface ResolvedAdminAuthConfig {
  mode: AdminAuthMode;
  username: string;
  password: string;
}

export type VerifyAdminCredentialsResult =
  | {
      ok: true;
      mode: AdminAuthMode;
      username: string;
      namespaceSlug: string;
      subject: string;
    }
  | {
      ok: false;
      reason: "missing_credentials" | "invalid_credentials";
    };

const textEncoder = new TextEncoder();

export function normalizeAdminUsername(raw: string | undefined | null): string {
  return (raw ?? "").trim().toLowerCase();
}

export function deriveNamespaceSlugForAdmin(username: string): string {
  const normalized = normalizeAdminUsername(username);
  const validated = validateSlugForRoute(normalized);
  if (validated.ok) return validated.slug;
  return DEFAULT_DEMO_ADMIN_USERNAME;
}

export function buildLocalAccountSubject(username: string): string {
  return `local:${normalizeAdminUsername(username) || DEFAULT_DEMO_ADMIN_USERNAME}`;
}

export function resolveAdminAuthConfig(env: AdminAuthEnv): ResolvedAdminAuthConfig {
  const configuredUsername = normalizeAdminUsername(env.ADMIN_USERNAME);
  const username = configuredUsername || DEFAULT_DEMO_ADMIN_USERNAME;
  const configuredPassword = env.ADMIN_PASSWORD?.trim();

  if (configuredPassword) {
    return {
      mode: "configured",
      username,
      password: configuredPassword,
    };
  }

  return {
    mode: "demo",
    username,
    password: DEFAULT_DEMO_ADMIN_PASSWORD,
  };
}

export function isDemoModeEnabled(env: AdminAuthEnv): boolean {
  return resolveAdminAuthConfig(env).mode === "demo";
}

/**
 * Constant-time string comparison using SHA-256 digests so comparison timing
 * does not leak credential length or shared prefixes.
 */
export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(left)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = 0;
  for (let i = 0; i < leftBytes.length; i += 1) {
    diff |= leftBytes[i]! ^ rightBytes[i]!;
  }
  return diff === 0;
}

export async function verifyAdminCredentials(
  env: AdminAuthEnv,
  rawUsername: string,
  rawPassword: string
): Promise<VerifyAdminCredentialsResult> {
  const username = normalizeAdminUsername(rawUsername);
  const password = rawPassword;

  if (!username || !password) {
    return { ok: false, reason: "missing_credentials" };
  }

  const config = resolveAdminAuthConfig(env);
  const [usernameMatches, passwordMatches] = await Promise.all([
    constantTimeEqual(username, config.username),
    constantTimeEqual(password, config.password),
  ]);

  if (!usernameMatches || !passwordMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  return {
    ok: true,
    mode: config.mode,
    username: config.username,
    namespaceSlug: deriveNamespaceSlugForAdmin(config.username),
    subject: buildLocalAccountSubject(config.username),
  };
}

/**
 * Restricts post-login redirect targets to safe same-origin relative paths so
 * `?next=...` cannot be abused as an open redirect or redirect back into `/auth`.
 */
export function sanitizeNextRedirect(rawNext: string | null | undefined): string {
  if (!rawNext) return DEFAULT_POST_LOGIN_REDIRECT;
  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/")) return DEFAULT_POST_LOGIN_REDIRECT;
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return DEFAULT_POST_LOGIN_REDIRECT;
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return DEFAULT_POST_LOGIN_REDIRECT;
  if (trimmed === "/auth" || trimmed.startsWith("/auth?")) return DEFAULT_POST_LOGIN_REDIRECT;
  return trimmed;
}
