import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveActiveSidebarItem } from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  mergeAndSanitizeSiteBranding,
  sanitizeBrandingUrl,
  sanitizeSupportEmail,
} from "@/shared/branding";
import { isAllowedOrigin } from "@/worker/auth/origin";
import {
  AUTH_RATE_LIMIT_MAX_FAILURES,
  AUTH_RATE_LIMIT_WINDOW_SECONDS,
  buildAuthRateLimitKey,
  evaluateAuthRateLimit,
  recordAuthRateLimitFailure,
} from "@/worker/auth/rateLimit";

describe("phase 04 pure domain logic", () => {
  it("enforces strict protocol and host validation on same-origin checks", () => {
    assert.equal(
      isAllowedOrigin("https://app.example.com", "https://app.example.com/admin/api/settings"),
      true
    );
    assert.equal(
      isAllowedOrigin("http://app.example.com", "https://app.example.com/admin/api/settings"),
      false
    );
    assert.equal(
      isAllowedOrigin("https://preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "preview.run.app",
        forwardedProto: "https",
      }),
      true
    );
    assert.equal(
      isAllowedOrigin("http://preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "preview.run.app",
        forwardedProto: "https",
      }),
      false
    );
    assert.equal(
      isAllowedOrigin("https://evil.com@preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "evil.com@preview.run.app",
        forwardedProto: "https",
      }),
      false
    );
  });

  it("tracks auth failure rate limits and computes retryAfter deterministically", () => {
    const now = 1_700_000_000_000;
    const key = buildAuthRateLimitKey("login", "203.0.113.10", "@alice");
    assert.equal(key, "auth-rl:login:203.0.113.10:alice");

    let state = recordAuthRateLimitFailure(null, now);
    assert.equal(state.failures, 1);
    assert.equal(evaluateAuthRateLimit(state, now).allowed, true);

    for (let i = 1; i < AUTH_RATE_LIMIT_MAX_FAILURES - 1; i += 1) {
      state = recordAuthRateLimitFailure(state, now + i * 1000);
      assert.equal(evaluateAuthRateLimit(state, now + i * 1000).allowed, true);
    }

    state = recordAuthRateLimitFailure(state, now + 10_000);
    assert.equal(state.failures, AUTH_RATE_LIMIT_MAX_FAILURES);
    const blocked = evaluateAuthRateLimit(state, now + 10_000);
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) {
      assert.ok(blocked.retryAfterSeconds > 0);
      assert.ok(blocked.retryAfterSeconds <= AUTH_RATE_LIMIT_WINDOW_SECONDS);
    }

    const expired = evaluateAuthRateLimit(state, now + AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000 + 1);
    assert.equal(expired.allowed, true);
  });

  it("sanitizes configurable branding fields and maps all admin sidebar views", () => {
    assert.equal(sanitizeBrandingUrl("https://git.acme.dev/docs"), "https://git.acme.dev/docs");
    assert.equal(sanitizeBrandingUrl("javascript:alert(1)"), "");
    assert.equal(sanitizeSupportEmail("ops@acme.dev"), "ops@acme.dev");
    assert.equal(sanitizeSupportEmail("bad email@acme.dev"), "");
    assert.equal(extractHostLabel("http://localhost:3000/auth"), "localhost:3000");

    const updated = mergeAndSanitizeSiteBranding(DEFAULT_SITE_BRANDING, {
      shortName: "Acme Git",
      websiteUrl: "javascript:alert(1)",
      supportEmail: "team@acme.dev",
      docsUrl: "https://docs.acme.dev",
    });
    assert.equal(updated.shortName, "Acme Git");
    assert.equal(updated.websiteUrl, "");
    assert.equal(updated.supportEmail, "team@acme.dev");
    assert.equal(updated.docsUrl, "https://docs.acme.dev");

    assert.equal(resolveActiveSidebarItem("system-admin-repositories"), "admin");
    assert.equal(resolveActiveSidebarItem("system-admin-tokens"), "admin");
    assert.equal(resolveActiveSidebarItem("system-admin-settings"), "admin");
    assert.equal(resolveActiveSidebarItem("system-admin-security"), "admin");
  });
});
