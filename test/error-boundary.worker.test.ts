import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureD1Migrations } from "./util/d1Setup";
import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";

const ORIGIN = "https://example.com";

async function signInAsDemoAdmin(): Promise<string> {
  const res = await SELF.fetch(`${ORIGIN}/auth/demo-login`, {
    method: "POST",
    headers: { Origin: ORIGIN },
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  const token = extractSessionToken(res.headers.get("set-cookie"));
  expect(token).toBeTruthy();
  return sessionCookieHeader(token!);
}

describe("Phase-05 error boundaries & secondary page alignment", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("renders aligned 404 NotFoundPage HTML for unmatched UI routes", async () => {
    const res = await SELF.fetch(`${ORIGIN}/does-not-exist-anywhere/missing-page`, {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Not Found");
    expect(html).not.toContain("font-display");
  });

  it("renders styled ErrorPage HTML with 400 status on invalid owner/ref queries", async () => {
    const badOwnerRes = await SELF.fetch(`${ORIGIN}/invalid$owner`, {
      headers: { Accept: "text/html" },
    });
    expect(badOwnerRes.status).toBe(400);
    const badOwnerHtml = await badOwnerRes.text();
    expect(badOwnerHtml).toContain("Something went wrong");
    expect(badOwnerHtml).not.toContain("font-display");
    expect(badOwnerHtml).not.toContain("rounded-2xl");
  });

  it("keeps rawpath hotlink protection and missing-path 404 responses working cleanly", async () => {
    // Trigger demo workspace seed via /
    const homeRes = await SELF.fetch(`${ORIGIN}/`);
    expect(homeRes.status).toBe(200);

    const noRefererRes = await SELF.fetch(
      `${ORIGIN}/alex-dev/cloud-forge-kit/rawpath?ref=main&path=README.md`
    );
    expect(noRefererRes.status).toBe(403);

    const missingPathRes = await SELF.fetch(
      `${ORIGIN}/alex-dev/cloud-forge-kit/rawpath?ref=main&path=nonexistent-file-xyz.png`,
      {
        headers: { Referer: `${ORIGIN}/alex-dev/cloud-forge-kit` },
      }
    );
    expect(missingPathRes.status).toBe(404);

    const readmeRawRes = await SELF.fetch(
      `${ORIGIN}/alex-dev/cloud-forge-kit/rawpath?ref=main&path=README.md`,
      {
        headers: { Referer: `${ORIGIN}/alex-dev/cloud-forge-kit` },
      }
    );
    expect(readmeRawRes.status).toBe(200);
    expect(await readmeRawRes.text()).toContain("cloud-forge-kit");
  });

  it("renders Home, AuthSignIn, AdminSettings, and AdminSecurity with Phase-05 aligned styles", async () => {
    const authRes = await SELF.fetch(`${ORIGIN}/auth`);
    expect(authRes.status).toBe(200);
    const authHtml = await authRes.text();
    expect(authHtml).toContain("Sign in");
    expect(authHtml).not.toContain("font-display");

    const adminCookie = await signInAsDemoAdmin();
    const settingsRes = await SELF.fetch(`${ORIGIN}/admin/settings`, {
      headers: { Cookie: adminCookie },
    });
    expect(settingsRes.status).toBe(200);
    const settingsHtml = await settingsRes.text();
    expect(settingsHtml).toContain("Settings Control Panel");
    expect(settingsHtml).toContain("Site administration navigation");

    const securityRes = await SELF.fetch(`${ORIGIN}/admin/security`, {
      headers: { Cookie: adminCookie },
    });
    expect(securityRes.status).toBe(200);
    const securityHtml = await securityRes.text();
    expect(securityHtml).toContain("Role-Based Access Control (RBAC) Matrix");
  });
});
