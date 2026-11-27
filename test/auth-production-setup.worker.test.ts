import { applyD1Migrations } from "cloudflare:test";
import { env, exports as workerExports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { readAppD1Migrations } from "./util/d1Migrations";

const ORIGIN = "https://example.com";

beforeAll(async () => {
  await applyD1Migrations(env.DB, readAppD1Migrations());
});

describe("production mode first-run admin setup and zero-demo isolation", () => {
  it("claims initial D1 admin once in unconfigured production mode, locks setup, and signs in with PBKDF2", async () => {
    const originalAuthMode = env.AUTH_MODE;
    const originalAdminPassword = env.ADMIN_PASSWORD;
    env.AUTH_MODE = "production";
    env.ADMIN_PASSWORD = "";

    try {
      // 1. Homepage in production mode must NOT seed demo user @alex-dev or mock repos
      const homeRes = await workerExports.default.fetch(`${ORIGIN}/`);
      expect(homeRes.status).toBe(200);
      const homeHtml = await homeRes.text();
      expect(homeHtml).not.toContain("alex-dev/cloud-forge-kit");

      // 2. GET /auth renders Production Auth + Initialize Admin form with zero demo credentials
      const authRes = await workerExports.default.fetch(`${ORIGIN}/auth`);
      expect(authRes.status).toBe(200);
      const authHtml = await authRes.text();
      expect(authHtml).toContain("Production Auth");
      expect(authHtml).toContain("Initialize Admin");
      expect(authHtml).toContain('action="/auth/setup"');
      expect(authHtml).not.toContain("Quick Demo Login");
      expect(authHtml).not.toContain("admin123");
      expect(authHtml).not.toContain("devuser123");

      // 3. Rejects mismatched or weak password on POST /auth/setup
      const mismatchRes = await workerExports.default.fetch(`${ORIGIN}/auth/setup`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "founder",
          password: "StrongPassword#2026",
          confirmPassword: "DifferentPassword#2026",
        }).toString(),
      });
      expect(mismatchRes.status).toBe(303);
      expect(mismatchRes.headers.get("location")).toBe("/auth?error=password_mismatch");

      // 4. Valid initial admin setup stores PBKDF2 hash in D1 and signs in
      const setupRes = await workerExports.default.fetch(`${ORIGIN}/auth/setup`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "founder",
          displayName: "Site Founder",
          password: "StrongPassword#2026",
          confirmPassword: "StrongPassword#2026",
          next: "/admin",
        }).toString(),
      });
      expect(setupRes.status).toBe(303);
      expect(setupRes.headers.get("location")).toBe("/admin");
      const setupToken = extractSessionToken(setupRes.headers.get("set-cookie"));
      expect(setupToken).toBeTruthy();

      const adminPageRes = await workerExports.default.fetch(`${ORIGIN}/admin`, {
        headers: { Cookie: sessionCookieHeader(setupToken!) },
      });
      expect(adminPageRes.status).toBe(200);

      // 5. Setup endpoint locks permanently once an admin exists in D1
      const lockedRes = await workerExports.default.fetch(`${ORIGIN}/auth/setup`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "attacker",
          password: "AttackerPassword#2026",
          confirmPassword: "AttackerPassword#2026",
        }).toString(),
      });
      expect(lockedRes.status).toBe(303);
      expect(lockedRes.headers.get("location")).toBe("/auth?error=setup_locked");

      // 6. GET /auth now shows standard Production Auth login form (no setup form)
      const lockedAuthRes = await workerExports.default.fetch(`${ORIGIN}/auth`);
      const lockedAuthHtml = await lockedAuthRes.text();
      expect(lockedAuthHtml).toContain("Production Auth");
      expect(lockedAuthHtml).toContain('action="/auth/login"');
      expect(lockedAuthHtml).not.toContain('action="/auth/setup"');

      // 7. Claimed admin can sign in via POST /auth/login using D1 PBKDF2 verification
      const loginRes = await workerExports.default.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "founder",
          password: "StrongPassword#2026",
          next: "/admin/settings",
        }).toString(),
      });
      expect(loginRes.status).toBe(303);
      expect(loginRes.headers.get("location")).toBe("/admin/settings");
      const founderToken = extractSessionToken(loginRes.headers.get("set-cookie"));
      expect(founderToken).toBeTruthy();
      const founderCookie = sessionCookieHeader(founderToken!);

      // 8. Admin Settings and Security render D1 Production Auth labels (not ADMIN_PASSWORD set)
      const settingsRes = await workerExports.default.fetch(`${ORIGIN}/admin/settings`, {
        headers: { Cookie: founderCookie },
      });
      expect(settingsRes.status).toBe(200);
      const settingsHtml = await settingsRes.text();
      expect(settingsHtml).toContain("d1-auth · read-only");
      expect(settingsHtml).toContain("Production D1 Auth");
      expect(settingsHtml).toContain("(d1-directory · setup claimed)");

      const securityRes = await workerExports.default.fetch(`${ORIGIN}/admin/security`, {
        headers: { Cookie: founderCookie },
      });
      expect(securityRes.status).toBe(200);
      const securityHtml = await securityRes.text();
      expect(securityHtml).toContain("login: founder (d1)");

      // 9. D1 primary admin can change own password via POST /auth/api/change-password
      const changePwRes = await workerExports.default.fetch(`${ORIGIN}/auth/api/change-password`, {
        method: "POST",
        headers: {
          Cookie: founderCookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: "StrongPassword#2026",
          newPassword: "BrandNewStrongPassword#2026",
        }),
      });
      expect(changePwRes.status).toBe(200);
      const changePwJson = (await changePwRes.json()) as { ok: boolean };
      expect(changePwJson.ok).toBe(true);

      // New session cookie was set for caller
      const refreshedToken = extractSessionToken(changePwRes.headers.get("set-cookie"));
      expect(refreshedToken).toBeTruthy();
      const refreshedCookie = sessionCookieHeader(refreshedToken!);

      // 10. Prior session cookie with old sessionEpoch is now revoked
      const oldSessionRes = await workerExports.default.fetch(`${ORIGIN}/admin`, {
        headers: { Cookie: founderCookie },
        redirect: "manual",
      });
      expect(oldSessionRes.status).toBe(302);
      expect(oldSessionRes.headers.get("location")).toBe("/auth?next=%2Fadmin");

      // Refreshed session cookie works
      const newSessionRes = await workerExports.default.fetch(`${ORIGIN}/admin`, {
        headers: { Cookie: refreshedCookie },
      });
      expect(newSessionRes.status).toBe(200);

      // 11. Login with old password fails; login with new password succeeds
      const oldLoginRes = await workerExports.default.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "founder",
          password: "StrongPassword#2026",
        }).toString(),
      });
      expect(oldLoginRes.status).toBe(303);
      expect(oldLoginRes.headers.get("location")).toBe("/auth?error=invalid_credentials");

      const newLoginRes = await workerExports.default.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "founder",
          password: "BrandNewStrongPassword#2026",
          next: "/admin",
        }).toString(),
      });
      expect(newLoginRes.status).toBe(303);
      expect(newLoginRes.headers.get("location")).toBe("/admin");

      // 12. Creating a member user with handle `@admin` does not hijack `@founder` primary-admin status
      const createMemberAdminSlugRes = await workerExports.default.fetch(
        `${ORIGIN}/admin/api/users`,
        {
          method: "POST",
          headers: {
            Cookie: refreshedCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            handle: "admin",
            displayName: "Regular Admin Handle User",
            role: "member",
            status: "active",
            password: "MemberPassword#2026",
          }),
        }
      );
      expect(createMemberAdminSlugRes.status).toBe(201);

      const listUsersRes = await workerExports.default.fetch(`${ORIGIN}/admin/api/users`, {
        headers: { Cookie: refreshedCookie },
      });
      expect(listUsersRes.status).toBe(200);
      const listUsersJson = (await listUsersRes.json()) as {
        users: Array<{ id: string; slug: string; isPrimaryAdmin: boolean; role: string }>;
      };
      const founderEntry = listUsersJson.users.find((u) => u.slug === "founder");
      const memberAdminEntry = listUsersJson.users.find((u) => u.slug === "admin");
      expect(founderEntry?.isPrimaryAdmin).toBe(true);
      expect(memberAdminEntry?.isPrimaryAdmin).toBe(false);
      expect(memberAdminEntry?.role).toBe("member");

      // Primary admin `@founder` remains protected against deletion
      const deleteFounderRes = await workerExports.default.fetch(
        `${ORIGIN}/admin/api/users/${encodeURIComponent(founderEntry!.id)}`,
        {
          method: "DELETE",
          headers: {
            Cookie: refreshedCookie,
            Origin: ORIGIN,
          },
        }
      );
      expect(deleteFounderRes.status).toBe(403);
    } finally {
      env.AUTH_MODE = originalAuthMode;
      env.ADMIN_PASSWORD = originalAdminPassword;
    }
  });
});
