import { applyD1Migrations } from "cloudflare:test";
import { env, exports as workerExports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { readAppD1Migrations } from "./util/d1Migrations";

beforeAll(async () => {
  await applyD1Migrations(env.DB, readAppD1Migrations());
});

async function demoSignIn(): Promise<string> {
  const res = await workerExports.default.fetch("https://example.com/auth/demo-login", {
    method: "POST",
    redirect: "manual",
    headers: { Origin: "https://example.com" },
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/");
  const token = extractSessionToken(res.headers.get("set-cookie"));
  expect(token).toBeTruthy();
  return token!;
}

describe("merged /auth/account hub", () => {
  it("renders identity, namespaces, seeded demo repositories, and the tokens island on one page", async () => {
    const token = await demoSignIn();
    const res = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: sessionCookieHeader(token) },
    });
    expect(res.status).toBe(200);
    const html = await res.text();

    // Identity renders the admin namespace handle.
    expect(html).toContain("@admin");
    expect(html).toContain("Identity");
    expect(html).not.toContain("Your account");

    // The sections all live on this single dashboard page.
    expect(html).toContain("Namespaces");
    expect(html).toContain("Repositories");
    expect(html).toContain("Tokens");

    // Starter demo repositories are visible immediately after login.
    expect(html).toContain("admin/edge-starter");
    expect(html).toContain("admin/infra-notes");

    // Both interactive islands host hydration markers.
    expect(html).toContain('id="tokens"');
    expect(html).toContain('data-island="tokens"');
    expect(html).toContain('data-island="repositories"');
  });

  it("removes legacy tessera OIDC start and callback routes", async () => {
    const startRes = await workerExports.default.fetch("https://example.com/auth/start", {
      redirect: "manual",
    });
    expect(startRes.status).toBe(404);

    const callbackRes = await workerExports.default.fetch("https://example.com/auth/callback", {
      redirect: "manual",
    });
    expect(callbackRes.status).toBe(404);
  });

  it("/auth/tokens no longer routes to the management page", async () => {
    const token = await demoSignIn();
    const res = await workerExports.default.fetch("https://example.com/auth/tokens", {
      headers: { Cookie: sessionCookieHeader(token) },
      redirect: "manual",
    });
    if (res.status === 200) {
      const html = await res.text();
      expect(html).not.toContain('data-island="tokens"');
      expect(html).not.toContain('id="tokens"');
    }
  });
});
