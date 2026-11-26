import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureD1Migrations } from "./util/d1Setup";
import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";

const ORIGIN = "https://example.com";

describe("Dev Mode test user (@alex-dev) and mock GitHub-ready repository", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("seeds @alex-dev and alex-dev/cloud-forge-kit on public entry and renders the full mock project structure", async () => {
    // 1. Public homepage lazily seeds @alex-dev in Demo Mode
    const homeRes = await SELF.fetch(`${ORIGIN}/`);
    expect(homeRes.status).toBe(200);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain("alex-dev/cloud-forge-kit");

    // 2. Public profile at /alex-dev renders bio, .vibtools profile README, and pinned project
    const profileRes = await SELF.fetch(`${ORIGIN}/alex-dev`);
    expect(profileRes.status).toBe(200);
    const profileHtml = await profileRes.text();
    expect(profileHtml).toContain("Alex Rivera");
    expect(profileHtml).toContain("San Francisco, CA");
    expect(profileHtml).toContain("Hi, I'm Alex Rivera");
    expect(profileHtml).toContain("alex-dev/cloud-forge-kit");

    // 3. Mock repository overview shows folders, root files, and rendered README
    const repoRes = await SELF.fetch(`${ORIGIN}/alex-dev/cloud-forge-kit`);
    expect(repoRes.status).toBe(200);
    const repoHtml = await repoRes.text();
    for (const expectedEntry of [
      ".github",
      "docs",
      "src",
      "test",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "LICENSE",
      "README.md",
      "package.json",
      "tsconfig.json",
      "wrangler.jsonc",
      "Scripts &amp; Tooling",
      "Project Structure",
    ]) {
      expect(repoHtml).toContain(expectedEntry);
    }

    // 4. Nested tree navigation (/src) and markdown blob (/docs/architecture.md) and commits
    const srcTreeRes = await SELF.fetch(
      `${ORIGIN}/alex-dev/cloud-forge-kit/tree?ref=main&path=src`
    );
    expect(srcTreeRes.status).toBe(200);
    const srcTreeHtml = await srcTreeRes.text();
    expect(srcTreeHtml).toContain("middleware");
    expect(srcTreeHtml).toContain("utils");
    expect(srcTreeHtml).toContain("index.ts");
    expect(srcTreeHtml).toContain("router.ts");

    const docsBlobRes = await SELF.fetch(
      `${ORIGIN}/alex-dev/cloud-forge-kit/blob?ref=main&path=docs%2Farchitecture.md`
    );
    expect(docsBlobRes.status).toBe(200);
    const docsBlobHtml = await docsBlobRes.text();
    expect(docsBlobHtml).toContain("Architecture Overview");
    expect(docsBlobHtml).toContain("Design Invariants");

    const commitsRes = await SELF.fetch(`${ORIGIN}/alex-dev/cloud-forge-kit/commits`);
    expect(commitsRes.status).toBe(200);
    const commitsHtml = await commitsRes.text();
    expect(commitsHtml).toContain(
      "docs: add GitHub-ready README, contributing guide, changelog, and architecture docs"
    );
    expect(commitsHtml).toContain(
      "feat: implement typed router, bearer auth middleware, cache helper, and tests"
    );
    expect(commitsHtml).toContain("chore: initialize package config, CI workflow, and MIT license");
  });

  it("supports Demo User Panel sign-in, manual alex-dev login, Users Panel routes, and /admin restriction", async () => {
    // 1. Sign-in page advertises both demo admin and demo test user credentials
    const authRes = await SELF.fetch(`${ORIGIN}/auth`);
    expect(authRes.status).toBe(200);
    const authHtml = await authRes.text();
    expect(authHtml).toContain("Quick Demo Login");
    expect(authHtml).toContain("Demo User Panel");
    expect(authHtml).toContain("alex-dev / devuser123");

    // 2. Demo User Panel one-click login signs in as @alex-dev (member) and redirects to /user/profile
    const demoUserRes = await SELF.fetch(`${ORIGIN}/auth/demo-login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ account: "user", next: "/user/profile" }).toString(),
    });
    expect(demoUserRes.status).toBe(303);
    expect(demoUserRes.headers.get("location")).toBe("/user/profile");
    const demoToken = extractSessionToken(demoUserRes.headers.get("set-cookie"));
    expect(demoToken).toBeTruthy();
    const userCookie = sessionCookieHeader(demoToken!);

    // 3. Users Panel routes load cleanly and do not leak Admin CTAs or duplicate links
    const profilePanelRes = await SELF.fetch(`${ORIGIN}/user/profile`, {
      headers: { Cookie: userCookie },
    });
    expect(profilePanelRes.status).toBe(200);
    const profilePanelHtml = await profilePanelRes.text();
    expect(profilePanelHtml).toContain("@alex-dev");
    expect(profilePanelHtml).toContain("Alex Rivera");
    expect(profilePanelHtml).toContain("Public profile");
    expect(profilePanelHtml).not.toContain("Site Administration");
    expect(profilePanelHtml).not.toContain("Back to Repositories");
    expect(profilePanelHtml).not.toContain("Open /alex-dev");

    const securityRes = await SELF.fetch(`${ORIGIN}/user/settings/security`, {
      headers: { Cookie: userCookie },
    });
    expect(securityRes.status).toBe(200);
    const securityHtml = await securityRes.text();
    expect(securityHtml).toContain("Change password");
    expect(securityHtml).not.toContain("Back to Repositories");
    expect(securityHtml).not.toContain("/admin/users");

    const tokensRes = await SELF.fetch(`${ORIGIN}/user/settings/tokens`, {
      headers: { Cookie: userCookie },
    });
    expect(tokensRes.status).toBe(200);
    const tokensHtml = await tokensRes.text();
    expect(tokensHtml).not.toContain("Back to Repositories");

    // 3b. Even when an admin visits /user/profile, main/sidebar stays free of leaked Site Administration CTA
    const demoAdminRes = await SELF.fetch(`${ORIGIN}/auth/demo-login`, {
      method: "POST",
      redirect: "manual",
      headers: { Origin: ORIGIN },
    });
    const adminToken = extractSessionToken(demoAdminRes.headers.get("set-cookie"));
    expect(adminToken).toBeTruthy();
    const adminProfileRes = await SELF.fetch(`${ORIGIN}/user/profile`, {
      headers: { Cookie: sessionCookieHeader(adminToken!) },
    });
    expect(adminProfileRes.status).toBe(200);
    const adminProfileHtml = await adminProfileRes.text();
    const adminMainHtml =
      adminProfileHtml.split("<main")[1]?.split("</main>")[0] ?? adminProfileHtml;
    expect(adminMainHtml).toContain("Public profile");
    expect(adminMainHtml).not.toContain("Site Administration");
    expect(adminMainHtml).not.toContain("Back to Repositories");
    expect(adminMainHtml).not.toContain("Open /admin");
    expect(adminMainHtml).not.toContain('href="/admin"');
    expect(adminProfileHtml).toContain('href="/profile/admin"');

    // 4. Member test user is blocked from Admin routes
    const adminPageRes = await SELF.fetch(`${ORIGIN}/admin`, {
      headers: { Cookie: userCookie },
      redirect: "manual",
    });
    expect(adminPageRes.status).toBe(303);
    expect(adminPageRes.headers.get("location")).toBe("/");

    const adminApiRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      headers: { Cookie: userCookie },
    });
    expect(adminApiRes.status).toBe(403);

    // 5. Manual login with alex-dev / devuser123 also works
    const manualLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        username: "alex-dev",
        password: "devuser123",
        next: "/user/account",
      }).toString(),
    });
    expect(manualLoginRes.status).toBe(303);
    expect(manualLoginRes.headers.get("location")).toBe("/user/account");
    expect(extractSessionToken(manualLoginRes.headers.get("set-cookie"))).toBeTruthy();

    // 6. When ADMIN_PASSWORD is configured or AUTH_MODE=production, Demo Mode is disabled
    const originalAdminPassword = env.ADMIN_PASSWORD;
    const originalAuthMode = env.AUTH_MODE;
    try {
      // 6a. Explicit AUTH_MODE=production without ADMIN_PASSWORD still disables demo mode and rejects admin123
      env.AUTH_MODE = "production";
      env.ADMIN_PASSWORD = "";

      const prodDemoRes = await SELF.fetch(`${ORIGIN}/auth/demo-login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ account: "admin" }).toString(),
      });
      expect(prodDemoRes.status).toBe(403);

      const prodDefaultAdminLogin = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "admin",
          password: "admin123",
        }).toString(),
      });
      expect(prodDefaultAdminLogin.status).toBe(303);
      expect(prodDefaultAdminLogin.headers.get("location")).toBe("/auth?error=invalid_credentials");
      expect(extractSessionToken(prodDefaultAdminLogin.headers.get("set-cookie"))).toBeNull();

      const prodAuthPageRes = await SELF.fetch(`${ORIGIN}/auth`);
      expect(prodAuthPageRes.status).toBe(200);
      const prodAuthPageHtml = await prodAuthPageRes.text();
      expect(prodAuthPageHtml).toContain("Production Auth");
      expect(prodAuthPageHtml).not.toContain("Quick Demo Login");
      expect(prodAuthPageHtml).not.toContain("Demo User Panel");
      expect(prodAuthPageHtml).not.toContain("admin123");
      expect(prodAuthPageHtml).not.toContain("devuser123");

      // 6b. Configured ADMIN_PASSWORD in production mode authenticates the primary admin
      env.ADMIN_PASSWORD = "configured-prod-password";
      const disabledDemoRes = await SELF.fetch(`${ORIGIN}/auth/demo-login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ account: "user" }).toString(),
      });
      expect(disabledDemoRes.status).toBe(403);

      const prodConfiguredLogin = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "admin",
          password: "configured-prod-password",
        }).toString(),
      });
      expect(prodConfiguredLogin.status).toBe(303);
      expect(prodConfiguredLogin.headers.get("location")).toBe("/");
      expect(extractSessionToken(prodConfiguredLogin.headers.get("set-cookie"))).toBeTruthy();
    } finally {
      env.ADMIN_PASSWORD = originalAdminPassword;
      env.AUTH_MODE = originalAuthMode;
    }
  });
});
