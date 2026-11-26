import { describe, expect, it } from "vitest";

import {
  buildLocalAccountSubject,
  constantTimeEqual,
  DEFAULT_DEMO_ADMIN_PASSWORD,
  DEFAULT_DEMO_ADMIN_USERNAME,
  DEFAULT_POST_LOGIN_REDIRECT,
  deriveNamespaceSlugForAdmin,
  isDemoModeEnabled,
  isProductionRuntime,
  resolveAdminAuthConfig,
  resolveAuthRuntimeMode,
  resolveInitialAdminNamespaceSlug,
  sanitizeNextRedirect,
  verifyAdminCredentials,
} from "@/worker/auth/adminAuth";
import { isAllowedOrigin } from "@/worker/auth/origin";
import { hashPassword, verifyPassword } from "@/worker/auth/passwords";
import {
  AUTH_RATE_LIMIT_MAX_FAILURES,
  AUTH_RATE_LIMIT_WINDOW_SECONDS,
  buildAuthRateLimitKey,
  evaluateAuthRateLimit,
  extractClientIp,
  recordAuthRateLimitFailure,
} from "@/worker/auth/rateLimit";

describe("adminAuth pure logic", () => {
  it("defaults to demo mode with admin / admin123 when ADMIN_PASSWORD is unset in development", () => {
    const config = resolveAdminAuthConfig({});
    expect(config).toEqual({
      mode: "demo",
      username: DEFAULT_DEMO_ADMIN_USERNAME,
      password: DEFAULT_DEMO_ADMIN_PASSWORD,
    });
    expect(resolveAuthRuntimeMode({})).toBe("development");
    expect(isProductionRuntime({})).toBe(false);
    expect(isDemoModeEnabled({})).toBe(true);
  });

  it("switches to configured mode and disables demo login when ADMIN_PASSWORD is set", () => {
    const env = { ADMIN_USERNAME: "Operator", ADMIN_PASSWORD: "super-secret-password" };
    const config = resolveAdminAuthConfig(env);
    expect(config).toEqual({
      mode: "configured",
      username: "operator",
      password: "super-secret-password",
    });
    expect(isDemoModeEnabled(env)).toBe(false);
  });

  it("enforces production mode when AUTH_MODE=production and never falls back to demo password", async () => {
    const prodUnconfigured = { AUTH_MODE: "production" };
    expect(resolveAuthRuntimeMode(prodUnconfigured)).toBe("production");
    expect(isProductionRuntime(prodUnconfigured)).toBe(true);
    expect(isDemoModeEnabled(prodUnconfigured)).toBe(false);
    expect(resolveAdminAuthConfig(prodUnconfigured)).toEqual({
      mode: "configured",
      username: DEFAULT_DEMO_ADMIN_USERNAME,
      password: null,
    });

    // Default demo password `admin123` is strictly rejected in production mode
    expect(await verifyAdminCredentials(prodUnconfigured, "admin", "admin123")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });

    // Configured production ADMIN_PASSWORD succeeds in production mode
    const prodConfigured = {
      AUTH_MODE: "production",
      ADMIN_USERNAME: "prod-admin",
      ADMIN_PASSWORD: "prod-strong-password-2026",
    };
    expect(
      await verifyAdminCredentials(prodConfigured, "prod-admin", "prod-strong-password-2026")
    ).toEqual({
      ok: true,
      mode: "configured",
      username: "prod-admin",
      namespaceSlug: "prod-admin",
      subject: "local:prod-admin",
    });
  });

  it("verifies demo credentials and rejects missing or invalid credentials", async () => {
    expect(await verifyAdminCredentials({}, "", "")).toEqual({
      ok: false,
      reason: "missing_credentials",
    });
    expect(await verifyAdminCredentials({}, "admin", "")).toEqual({
      ok: false,
      reason: "missing_credentials",
    });
    expect(await verifyAdminCredentials({}, "admin", "wrong")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(await verifyAdminCredentials({}, "other", "admin123")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });

    const ok = await verifyAdminCredentials({}, "  ADMIN ", "admin123");
    expect(ok).toEqual({
      ok: true,
      mode: "demo",
      username: "admin",
      namespaceSlug: "admin",
      subject: "local:admin",
    });
  });

  it("uses constant-time equality cleanly", async () => {
    expect(await constantTimeEqual("abc", "abc")).toBe(true);
    expect(await constantTimeEqual("abc", "abd")).toBe(false);
    expect(await constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("derives valid namespace slugs and subjects", () => {
    expect(deriveNamespaceSlugForAdmin("Admin")).toBe("admin");
    expect(deriveNamespaceSlugForAdmin("not valid!!")).toBe("admin");
    expect(buildLocalAccountSubject("Ops")).toBe("local:ops");
    expect(
      resolveInitialAdminNamespaceSlug({
        ADMIN_USERNAME: "secret-admin-login",
        ADMIN_NAMESPACE: "VibTools",
      })
    ).toBe("vibtools");
    expect(
      resolveInitialAdminNamespaceSlug({
        ADMIN_USERNAME: "secret-admin-login",
        ADMIN_NAMESPACE: "api",
      })
    ).toBe("secret-admin-login");
  });

  it("sanitizes post-login redirect paths against open redirects and loops", () => {
    expect(sanitizeNextRedirect(undefined)).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("https://evil.example/phish")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("//evil.example")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("/\\evil.example")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("/auth")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("/auth?error=invalid")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(sanitizeNextRedirect("/admin/edge-starter/admin")).toBe("/admin/edge-starter/admin");
  });
});

describe("isAllowedOrigin reverse-proxy and CSRF checks", () => {
  it("accepts exact request origin and rejects missing or cross-origin", () => {
    expect(isAllowedOrigin("https://example.com", "https://example.com/auth/login")).toBe(true);
    expect(isAllowedOrigin("http://example.com", "https://example.com/auth/login")).toBe(false);
    expect(isAllowedOrigin(undefined, "https://example.com/auth/login")).toBe(false);
    expect(isAllowedOrigin("https://attacker.com", "https://example.com/auth/login")).toBe(false);
    expect(isAllowedOrigin("null", "https://example.com/auth/login")).toBe(false);
  });

  it("accepts matching Origin/X-Forwarded-Proto behind TLS-terminating preview proxy and rejects scheme downgrades", () => {
    expect(
      isAllowedOrigin("https://preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "preview.run.app",
        forwardedProto: "https",
      })
    ).toBe(true);
    expect(
      isAllowedOrigin("http://preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "preview.run.app",
        forwardedProto: "https",
      })
    ).toBe(false);
    expect(
      isAllowedOrigin("https://attacker.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "preview.run.app",
        forwardedProto: "https",
      })
    ).toBe(false);
    expect(
      isAllowedOrigin("https://evil.com@preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "evil.com@preview.run.app",
        forwardedProto: "https",
      })
    ).toBe(false);
  });
});

describe("auth rate limiting pure logic", () => {
  it("extracts client IPs and enforces sliding window limits", () => {
    expect(extractClientIp(new Request("https://example.com"))).toBe("unknown");
    expect(
      extractClientIp(
        new Request("https://example.com", { headers: { "cf-connecting-ip": "198.51.100.7" } })
      )
    ).toBe("198.51.100.7");
    expect(buildAuthRateLimitKey("login", "198.51.100.7", "Admin")).toBe(
      "auth-rl:login:198.51.100.7:admin"
    );

    const now = 1_700_000_000_000;
    let state = recordAuthRateLimitFailure(null, now);
    for (let i = 1; i < AUTH_RATE_LIMIT_MAX_FAILURES - 1; i += 1) {
      state = recordAuthRateLimitFailure(state, now + 500 * i);
      const decision = evaluateAuthRateLimit(state, now + 500 * i);
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(AUTH_RATE_LIMIT_MAX_FAILURES - (i + 1));
    }
    state = recordAuthRateLimitFailure(state, now + 5000);
    const blocked = evaluateAuthRateLimit(state, now + 5000);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(AUTH_RATE_LIMIT_WINDOW_SECONDS);
    }
  });
});

describe("PBKDF2-SHA256 password hashing", () => {
  it("generates unique salted hashes and verifies matching vs non-matching passwords", async () => {
    const hashA = await hashPassword("SuperSecret#2026");
    const hashB = await hashPassword("SuperSecret#2026");

    expect(hashA).toMatch(/^pbkdf2_sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(hashB).not.toBe(hashA);

    expect(await verifyPassword("SuperSecret#2026", hashA)).toBe(true);
    expect(await verifyPassword("SuperSecret#2026", hashB)).toBe(true);
    expect(await verifyPassword("WrongPassword!2026", hashA)).toBe(false);
    expect(await verifyPassword("", hashA)).toBe(false);
  });

  it("rejects null, empty, or malformed stored hashes safely", async () => {
    expect(await verifyPassword("anything123", null)).toBe(false);
    expect(await verifyPassword("anything123", undefined)).toBe(false);
    expect(await verifyPassword("anything123", "")).toBe(false);
    expect(await verifyPassword("anything123", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("anything123", "pbkdf2_sha256$10$abcd$ef01")).toBe(false);
  });
});
