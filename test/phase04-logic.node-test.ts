import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolvePublicErrorMessage } from "@/client/server/error";
import { resolveActiveSidebarItem } from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  mergeAndSanitizeSiteBranding,
  parseFooterAttribution,
  resolveAbsoluteBrandingUrl,
  resolveDocumentTitle,
  sanitizeBrandingAssetUrl,
  sanitizeBrandingUrl,
  sanitizeSupportEmail,
  validateBrandingAssetBytes,
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
    assert.equal(
      isAllowedOrigin("https://preview.run.app", "http://localhost:3000/auth/login", {
        forwardedHost: "preview.run.app",
      }),
      true
    );
    assert.equal(
      isAllowedOrigin("https://preview.run.app", "http://localhost:3000/auth/login", {
        host: "preview.run.app",
        forwardedProto: "http",
      }),
      true
    );
    assert.equal(
      isAllowedOrigin("https://preview.run.app", "http://localhost:3000/auth/login", {
        host: "localhost:3000",
        secFetchSite: "same-origin",
        referer: "https://preview.run.app/auth",
      }),
      true
    );
    assert.equal(
      isAllowedOrigin("https://attacker.example", "http://localhost:3000/auth/login", {
        host: "localhost:3000",
        secFetchSite: "cross-site",
        referer: "https://attacker.example/",
      }),
      false
    );
    assert.equal(
      isAllowedOrigin("https://preview.run.app", "http://localhost:3000/auth/login", {
        host: "localhost:3000",
        secFetchSite: "same-origin",
        referer: "https://attacker.example/auth",
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

  it("sanitizes branding asset URLs and resolves absolute URLs safely (Phase S1 & S2)", () => {
    assert.equal(
      sanitizeBrandingAssetUrl("/api/site-assets/logo?v=1700000000"),
      "/api/site-assets/logo?v=1700000000"
    );
    assert.equal(
      sanitizeBrandingAssetUrl("https://cdn.example.com/brand/logo.png"),
      "https://cdn.example.com/brand/logo.png"
    );
    assert.equal(sanitizeBrandingAssetUrl("javascript:alert(1)"), "");
    assert.equal(sanitizeBrandingAssetUrl("data:image/svg+xml,<svg/>"), "");
    assert.equal(sanitizeBrandingAssetUrl("/api/site-assets/../secret"), "");
    assert.equal(sanitizeBrandingAssetUrl(""), "");

    assert.equal(
      resolveAbsoluteBrandingUrl("/api/site-assets/og-image?v=1", "https://git.example.com"),
      "https://git.example.com/api/site-assets/og-image?v=1"
    );
    assert.equal(
      resolveAbsoluteBrandingUrl("https://cdn.example.com/og.png", "https://git.example.com"),
      "https://cdn.example.com/og.png"
    );
    assert.equal(resolveAbsoluteBrandingUrl("", "https://git.example.com"), "");
  });

  it("validates branding asset magic bytes and rejects unsafe formats like SVG (Phase S1)", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const icoBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    assert.deepEqual(validateBrandingAssetBytes("logo", pngBytes), {
      ok: true,
      contentType: "image/png",
    });
    assert.deepEqual(validateBrandingAssetBytes("favicon", icoBytes), {
      ok: true,
      contentType: "image/x-icon",
    });

    const icoOnLogo = validateBrandingAssetBytes("logo", icoBytes);
    assert.equal(icoOnLogo.ok, false);

    const svgOnLogo = validateBrandingAssetBytes("logo", svgBytes);
    assert.equal(svgOnLogo.ok, false);

    const emptyPayload = validateBrandingAssetBytes("favicon", new Uint8Array());
    assert.equal(emptyPayload.ok, false);
  });

  it("merges SEO/branding fields and resolves document titles with custom siteTitle and metaTitle (Phase S1 & S2)", () => {
    const merged = mergeAndSanitizeSiteBranding(DEFAULT_SITE_BRANDING, {
      siteTitle: "Acme Git",
      metaTitle: "Acme Git — Private Engineering Forge",
      metaDescription: "Fast Git hosting for Acme teams.",
      metaKeywords: "acme, git, hosting",
      logoUrl: "/api/site-assets/logo?v=42",
      faviconUrl: "/api/site-assets/favicon?v=42",
      ogImageUrl: "https://cdn.acme.test/og.png",
      allowIndexing: false,
    });

    assert.equal(merged.siteTitle, "Acme Git");
    assert.equal(merged.metaTitle, "Acme Git — Private Engineering Forge");
    assert.equal(merged.metaDescription, "Fast Git hosting for Acme teams.");
    assert.equal(merged.metaKeywords, "acme, git, hosting");
    assert.equal(merged.logoUrl, "/api/site-assets/logo?v=42");
    assert.equal(merged.faviconUrl, "/api/site-assets/favicon?v=42");
    assert.equal(merged.ogImageUrl, "https://cdn.acme.test/og.png");
    assert.equal(merged.allowIndexing, false);

    assert.equal(DEFAULT_SITE_BRANDING.siteName, "gitra");
    assert.equal(DEFAULT_SITE_BRANDING.shortName, "gitra");
    assert.equal(DEFAULT_SITE_BRANDING.siteTitle, "gitra · Open-Source Git Forge");
    assert.equal(DEFAULT_SITE_BRANDING.footerText, "© 2026 gitra · Vib Tools");

    assert.equal(
      resolveDocumentTitle("Repositories · gitra", merged, "home"),
      "Acme Git — Private Engineering Forge"
    );
    assert.equal(
      resolveDocumentTitle("Repositories · git-on-cloudflare", merged, "home"),
      "Acme Git — Private Engineering Forge"
    );
    assert.equal(resolveDocumentTitle("Explore · gitra", merged, "explore"), "Explore · Acme Git");
    assert.equal(
      resolveDocumentTitle("Explore · git-on-cloudflare", merged, "explore"),
      "Explore · Acme Git"
    );
    assert.equal(
      resolveDocumentTitle("acme/core · git-on-cloudflare", merged, "repo"),
      "acme/core · Acme Git"
    );

    const defaultAttribution = parseFooterAttribution(DEFAULT_SITE_BRANDING.footerText);
    assert.deepEqual(defaultAttribution.links, [
      { label: "gitra.co", href: "https://gitra.co" },
      { label: "vibtools.io", href: "https://vibtools.io" },
    ]);
    assert.deepEqual(
      defaultAttribution.segments.filter((segment) => segment.href),
      [
        { text: "gitra", href: "https://gitra.co" },
        { text: "Vib Tools", href: "https://vibtools.io" },
      ]
    );

    const customAttribution = parseFooterAttribution("© 2026 Orbit Labs");
    assert.deepEqual(customAttribution, {
      segments: [{ text: "© 2026 Orbit Labs" }],
      links: [],
    });
  });
});
