import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolvePublicErrorMessage } from "@/client/server/error";
import { resolveActiveSidebarItem } from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  mergeAndSanitizeSiteBranding,
  sanitizeBrandingUrl,
  sanitizeSupportEmail,
} from "@/shared/branding";
import { HttpError } from "@/shared/web/http";
import { isAllowedOrigin } from "@/worker/auth/origin";
import {
  AUTH_RATE_LIMIT_MAX_FAILURES,
  AUTH_RATE_LIMIT_WINDOW_SECONDS,
  buildAuthRateLimitKey,
  evaluateAuthRateLimit,
  recordAuthRateLimitFailure,
} from "@/worker/auth/rateLimit";
import { sortNamespacesForUser } from "@/worker/db/d1/dal/namespaces";
import { resolveUpsertTreeEntryPlan } from "@/worker/git/commitFile";
import { repoBranchCacheKey, routeCacheKey } from "@/worker/repositories/routeCache";

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

  it("prioritizes the user-owned namespace ahead of alphabetically earlier joined namespaces (BUG-NEW-01)", () => {
    const sorted = sortNamespacesForUser(
      [
        { slug: "vibtools", createdBy: "usr_vibtools" },
        { slug: "aaron", createdBy: "usr_aaron" },
        { slug: "admin", createdBy: "usr_admin" },
        { slug: "alex-dev", createdBy: "usr_alex" },
      ],
      "usr_admin"
    );
    assert.deepEqual(
      sorted.map((ns) => ns.slug),
      ["admin", "aaron", "alex-dev", "vibtools"]
    );
  });

  it("preserves executable file mode (100755) and rejects file-vs-directory path conflicts (BUG-NEW-10)", () => {
    const entries = [
      { mode: "100644", name: "README.md", oid: "1".repeat(40) },
      { mode: "100755", name: "deploy.sh", oid: "2".repeat(40) },
      { mode: "40000", name: "src", oid: "3".repeat(40) },
      { mode: "120000", name: "latest-link", oid: "4".repeat(40) },
    ];

    assert.deepEqual(resolveUpsertTreeEntryPlan(entries, "new.txt", true), {
      ok: true,
      mode: "100644",
      existingSubtreeOid: null,
    });
    assert.deepEqual(resolveUpsertTreeEntryPlan(entries, "deploy.sh", true), {
      ok: true,
      mode: "100755",
      existingSubtreeOid: null,
    });
    assert.deepEqual(resolveUpsertTreeEntryPlan(entries, "src", false), {
      ok: true,
      mode: "40000",
      existingSubtreeOid: "3".repeat(40),
    });

    const overwriteDirAsFile = resolveUpsertTreeEntryPlan(entries, "src", true);
    assert.equal(overwriteDirAsFile.ok, false);

    const overwriteSymlinkAsFile = resolveUpsertTreeEntryPlan(entries, "latest-link", true);
    assert.equal(overwriteSymlinkAsFile.ok, false);

    const traverseFileAsDir = resolveUpsertTreeEntryPlan(entries, "README.md", false);
    assert.equal(traverseFileAsDir.ok, false);
  });

  it("constructs canonical ROUTES KV keys for public route hints and cached default branches (BUG-NEW-05, BUG-NEW-06, BUG-NEW-12)", () => {
    assert.equal(routeCacheKey("vibtools", "edge-kit"), "repo-route:v1:vibtools/edge-kit");
    assert.equal(repoBranchCacheKey("repo_01HXYZ"), "repo-branch:repo_01HXYZ");
  });

  it("masks 500 error messages in non-debug mode while preserving exposed 4xx messages (BUG-NEW-08)", () => {
    assert.equal(
      resolvePublicErrorMessage(new Error("R2 SQLite internal failure"), 500, false),
      "Internal Server Error"
    );
    assert.equal(
      resolvePublicErrorMessage(new Error("R2 SQLite internal failure"), 500, true),
      "R2 SQLite internal failure"
    );
    assert.equal(
      resolvePublicErrorMessage(
        new HttpError(400, "Ref format not allowed", { expose: true }),
        400,
        false
      ),
      "Ref format not allowed"
    );
    assert.equal(
      resolvePublicErrorMessage(
        new HttpError(503, "Repository busy", { expose: true }),
        503,
        false
      ),
      "Repository busy"
    );
  });
});
