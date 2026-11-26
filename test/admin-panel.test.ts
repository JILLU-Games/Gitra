import { describe, expect, it } from "vitest";

import {
  buildDefaultRepoReadmeTemplate,
  buildGitCloneUrl,
  canAccessAdminPanel,
  canRemoveNamespaceEntry,
  canToggleNamespaceStatus,
  canWriteRepositories,
  computeAdminMetrics,
  computeUserRoleCounts,
  defaultDisplayNameForSlug,
  filterAdminUsers,
  formatPatScopeLabel,
  generateTemporaryPassword,
  mapScopeToPatLevel,
  normalizeNamespaceHandle,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_LOCATION_MAX_LENGTH,
  REPO_DESCRIPTION_MAX_LENGTH,
  resolveActiveSidebarItem,
  sanitizeDisplayName,
  sanitizeProfileBio,
  sanitizeProfileLocation,
  sanitizeProfileWebsite,
  sanitizeRepoDescription,
  validateUserPassword,
  type AdminNamespaceEntry,
} from "@/shared/admin/panel";
import {
  DEFAULT_SITE_BRANDING,
  extractHostLabel,
  mergeAndSanitizeSiteBranding,
  sanitizeBrandingUrl,
  sanitizeSupportEmail,
} from "@/shared/branding";

describe("admin panel pure helpers", () => {
  it("normalizes handles by trimming, stripping @, and lowercasing", () => {
    expect(normalizeNamespaceHandle("  @Platform-Bot ")).toEqual({
      ok: true,
      slug: "platform-bot",
    });
    expect(normalizeNamespaceHandle("@auth")).toEqual({
      ok: false,
      reason: "reserved",
    });
    expect(normalizeNamespaceHandle("bad_slug!")).toEqual({
      ok: false,
      reason: "format",
    });
    expect(normalizeNamespaceHandle("   ")).toEqual({
      ok: false,
      reason: "length",
    });
  });

  it("derives and sanitizes user display names cleanly", () => {
    expect(defaultDisplayNameForSlug("admin")).toBe("Administrator");
    expect(defaultDisplayNameForSlug("dev-team")).toBe("Dev Team");
    expect(sanitizeDisplayName("  Jane   Morales \t ", "jane-ops")).toBe("Jane Morales");
    expect(sanitizeDisplayName("   ", "jane-ops")).toBe("Jane Ops");
    expect(sanitizeDisplayName("a".repeat(120), "a")).toHaveLength(80);
  });

  it("builds canonical clone URLs without double slashes", () => {
    expect(buildGitCloneUrl("https://git.example.com/", "admin", "edge-starter")).toBe(
      "https://git.example.com/admin/edge-starter.git"
    );
    expect(buildGitCloneUrl("http://localhost:3000", "alice", "app")).toBe(
      "http://localhost:3000/alice/app.git"
    );
  });

  it("maps PAT scopes cleanly between UI labels and D1 grant levels", () => {
    expect(mapScopeToPatLevel("read")).toBe("pull");
    expect(mapScopeToPatLevel("read-write")).toBe("push");
    expect(formatPatScopeLabel("pull")).toBe("read");
    expect(formatPatScopeLabel("push")).toBe("read-write");
  });

  it("protects primary signed-in admin while permitting non-primary actions", () => {
    expect(canToggleNamespaceStatus({ id: "ns_1", isPrimaryAdmin: true })).toBe(false);
    expect(canToggleNamespaceStatus({ id: "ns_2", isPrimaryAdmin: false })).toBe(true);

    expect(canRemoveNamespaceEntry({ id: "ns_1", role: "admin", isPrimaryAdmin: true })).toBe(
      false
    );
    expect(canRemoveNamespaceEntry({ id: "ns_2", role: "admin", isPrimaryAdmin: false })).toBe(
      true
    );
    expect(canRemoveNamespaceEntry({ id: "ns_3", role: "member", isPrimaryAdmin: false })).toBe(
      true
    );
    expect(canRemoveNamespaceEntry({ id: "ns_4", role: "viewer", isPrimaryAdmin: false })).toBe(
      true
    );
  });

  it("filters users by query, role, and status and computes role counts", () => {
    const sampleUsers: AdminNamespaceEntry[] = [
      {
        id: "ns_1",
        slug: "admin",
        displayName: "Administrator",
        role: "admin",
        status: "active",
        repoCount: 3,
        createdAt: 1000,
        lastActiveAt: 2000,
        isPrimaryAdmin: true,
        hasPassword: false,
      },
      {
        id: "ns_2",
        slug: "jane-ops",
        displayName: "Jane Morales",
        role: "viewer",
        status: "active",
        repoCount: 0,
        createdAt: 1500,
        lastActiveAt: 1800,
        isPrimaryAdmin: false,
        hasPassword: true,
      },
      {
        id: "ns_3",
        slug: "build-bot",
        displayName: "Build Automation",
        role: "member",
        status: "disabled",
        repoCount: 1,
        createdAt: 1200,
        lastActiveAt: 1600,
        isPrimaryAdmin: false,
        hasPassword: false,
      },
    ];

    expect(
      filterAdminUsers(sampleUsers, { query: "@jane", role: "all", status: "all" }).map(
        (u) => u.slug
      )
    ).toEqual(["jane-ops"]);
    expect(
      filterAdminUsers(sampleUsers, { query: "Morales", role: "viewer", status: "active" }).map(
        (u) => u.slug
      )
    ).toEqual(["jane-ops"]);
    expect(
      filterAdminUsers(sampleUsers, { query: "", role: "all", status: "disabled" }).map(
        (u) => u.slug
      )
    ).toEqual(["build-bot"]);
    expect(
      filterAdminUsers(sampleUsers, { query: "admin", role: "viewer", status: "all" })
    ).toEqual([]);

    expect(computeUserRoleCounts(sampleUsers)).toEqual({
      total: 3,
      active: 2,
      disabled: 1,
      admins: 1,
      members: 1,
      viewers: 1,
    });
  });

  it("computes overview strip metrics accurately", () => {
    const metrics = computeAdminMetrics(
      [{ visibility: "public" }, { visibility: "private" }, { visibility: "public" }],
      [{ status: "active" }, { status: "disabled" }, { status: "active" }],
      [{ revokedAt: undefined }, { revokedAt: 1700000000000 }, { revokedAt: undefined }]
    );
    expect(metrics).toEqual({
      totalRepositories: 3,
      publicRepositories: 2,
      privateRepositories: 1,
      activeNamespaces: 2,
      totalNamespaces: 3,
      activeTokens: 2,
      totalTokens: 3,
    });
  });

  it("resolves active sidebar navigation item for every authenticated view", () => {
    expect(resolveActiveSidebarItem("home")).toBe("repositories");
    expect(resolveActiveSidebarItem("overview")).toBe("repositories");
    expect(resolveActiveSidebarItem("tree")).toBe("repositories");
    expect(resolveActiveSidebarItem("blob")).toBe("repositories");
    expect(resolveActiveSidebarItem("commits")).toBe("repositories");
    expect(resolveActiveSidebarItem("admin")).toBe("repositories");
    expect(resolveActiveSidebarItem("account")).toBe("account");
    expect(resolveActiveSidebarItem("system-admin")).toBe("admin");
    expect(resolveActiveSidebarItem("system-admin-repositories")).toBe("admin");
    expect(resolveActiveSidebarItem("system-admin-tokens")).toBe("admin");
    expect(resolveActiveSidebarItem("system-admin-settings")).toBe("admin");
    expect(resolveActiveSidebarItem("system-admin-security")).toBe("admin");
    expect(resolveActiveSidebarItem("system-admin-users")).toBe("admin-users");
    expect(resolveActiveSidebarItem("auth-signin")).toBeNull();
  });

  it("validates user password policy and generates strong CSPRNG temporary passwords", () => {
    expect(validateUserPassword("short")).toEqual({ ok: false, reason: "too-short" });
    expect(validateUserPassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).toEqual({
      ok: false,
      reason: "too-short",
    });
    expect(validateUserPassword("a".repeat(PASSWORD_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too-long",
    });
    expect(validateUserPassword("ValidPass123!")).toEqual({
      ok: true,
      password: "ValidPass123!",
    });

    const pw1 = generateTemporaryPassword(16);
    const pw2 = generateTemporaryPassword(16);
    expect(pw1).toHaveLength(16);
    expect(pw2).toHaveLength(16);
    expect(pw1).not.toBe(pw2);
    expect(validateUserPassword(pw1).ok).toBe(true);
    expect(/[A-Z]/.test(pw1)).toBe(true);
    expect(/[a-z]/.test(pw1)).toBe(true);
    expect(/[0-9]/.test(pw1)).toBe(true);
    expect(/[!@#$%^&*_-]/.test(pw1)).toBe(true);
  });

  it("enforces role-based capability helpers cleanly", () => {
    expect(canAccessAdminPanel("admin")).toBe(true);
    expect(canAccessAdminPanel("member")).toBe(false);
    expect(canAccessAdminPanel("viewer")).toBe(false);
    expect(canAccessAdminPanel(undefined)).toBe(false);

    expect(canWriteRepositories("admin")).toBe(true);
    expect(canWriteRepositories("member")).toBe(true);
    expect(canWriteRepositories("viewer")).toBe(false);
    expect(canWriteRepositories(undefined)).toBe(false);
  });

  it("sanitizes repository descriptions, profile bio/location/website, and generates starter READMEs", () => {
    expect(sanitizeRepoDescription("  Fast   edge\n\tGit server  ")).toBe("Fast edge Git server");
    expect(sanitizeRepoDescription("x".repeat(REPO_DESCRIPTION_MAX_LENGTH + 40))).toHaveLength(
      REPO_DESCRIPTION_MAX_LENGTH
    );

    expect(sanitizeProfileBio("  Shipping   workers \u0007 at scale  ")).toBe(
      "Shipping workers at scale"
    );
    expect(sanitizeProfileBio("b".repeat(PROFILE_BIO_MAX_LENGTH + 25))).toHaveLength(
      PROFILE_BIO_MAX_LENGTH
    );

    expect(sanitizeProfileLocation("  Dhaka,\tBD  ")).toBe("Dhaka, BD");
    expect(sanitizeProfileLocation("l".repeat(PROFILE_LOCATION_MAX_LENGTH + 20))).toHaveLength(
      PROFILE_LOCATION_MAX_LENGTH
    );

    expect(sanitizeProfileWebsite("")).toBe("");
    expect(sanitizeProfileWebsite("vibtools.dev")).toBe("https://vibtools.dev");
    expect(sanitizeProfileWebsite("https://vibtools.dev/docs")).toBe("https://vibtools.dev/docs");
    expect(sanitizeProfileWebsite("http://git.example.com:8080/org")).toBe(
      "http://git.example.com:8080/org"
    );
    expect(sanitizeProfileWebsite("javascript:alert(1)")).toBe("");
    expect(sanitizeProfileWebsite("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(sanitizeProfileWebsite("ftp://files.example.com")).toBe("");
    expect(sanitizeProfileWebsite("notadomain")).toBe("");

    const withDesc = buildDefaultRepoReadmeTemplate("alice", "core-kit", "Edge router kit");
    expect(withDesc).toContain("# core-kit");
    expect(withDesc).toContain("Edge router kit");
    expect(withDesc).toContain("git clone <clone-url>");

    const withoutDesc = buildDefaultRepoReadmeTemplate("alice", "core-kit");
    expect(withoutDesc).toContain("# core-kit");
    expect(withoutDesc).toContain("Repository hosted under `@alice`.");
  });

  it("sanitizes site branding URLs, support emails, and patch updates", () => {
    expect(sanitizeBrandingUrl("https://git.acme.dev/org")).toBe("https://git.acme.dev/org");
    expect(sanitizeBrandingUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeSupportEmail("help@acme.dev")).toBe("help@acme.dev");
    expect(sanitizeSupportEmail("not-an-email")).toBe("");
    expect(extractHostLabel("https://git.acme.dev/explore")).toBe("git.acme.dev");

    const updated = mergeAndSanitizeSiteBranding(DEFAULT_SITE_BRANDING, {
      shortName: "Acme Forge",
      websiteUrl: "https://acme.dev",
      websiteLabel: "acme.dev",
      docsUrl: "",
      supportEmail: "support@acme.dev",
      footerText: "© 2026 Acme",
    });
    expect(updated.shortName).toBe("Acme Forge");
    expect(updated.websiteUrl).toBe("https://acme.dev");
    expect(updated.docsUrl).toBe("");
    expect(updated.footerText).toBe("© 2026 Acme");
  });
});
