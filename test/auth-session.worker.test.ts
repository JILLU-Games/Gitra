import { applyD1Migrations } from "cloudflare:test";
import { env, exports as workerExports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { SESSION_COOKIE_HEADER_NAME } from "@/worker/auth/cookies";

import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { readAppD1Migrations } from "./util/d1Migrations";

beforeAll(async () => {
  await applyD1Migrations(env.DB, readAppD1Migrations());
});

async function signInAsAdmin(username = "admin", password = "admin123"): Promise<string> {
  const form = new URLSearchParams({ username, password });
  const res = await workerExports.default.fetch("https://example.com/auth/login", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://example.com",
    },
    body: form.toString(),
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/");
  const token = extractSessionToken(res.headers.get("set-cookie"));
  expect(token).toBeTruthy();
  return token!;
}

describe("admin login and session lifecycle", () => {
  it("renders the Admin Login page without tessera references", async () => {
    const res = await workerExports.default.fetch("https://example.com/auth");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Admin login");
    expect(html).toContain("Quick Demo Login");
    expect(html).toContain("admin123");
    expect(html.toLowerCase()).not.toContain("tessera");
  });

  it("rejects invalid credentials on POST /auth/login without setting a session cookie", async () => {
    const form = new URLSearchParams({ username: "admin", password: "wrong-password" });
    const res = await workerExports.default.fetch("https://example.com/auth/login", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://example.com",
      },
      body: form.toString(),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/auth?error=invalid_credentials");
    expect(extractSessionToken(res.headers.get("set-cookie"))).toBeNull();
  });

  it("issues a partitioned HttpOnly session cookie on valid admin login that authorizes /auth/account", async () => {
    const form = new URLSearchParams({ username: "admin", password: "admin123" });
    const loginRes = await workerExports.default.fetch("https://example.com/auth/login", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://example.com",
      },
      body: form.toString(),
    });
    expect(loginRes.status).toBe(303);
    expect(loginRes.headers.get("location")).toBe("/");
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=None");
    expect(setCookie).toContain("Partitioned");

    const token = extractSessionToken(setCookie)!;
    const res = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: sessionCookieHeader(token) },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("@admin");
  });

  it("supports one-click Quick Demo Login via POST /auth/demo-login and redirects to /", async () => {
    const res = await workerExports.default.fetch("https://example.com/auth/demo-login", {
      method: "POST",
      redirect: "manual",
      headers: { Origin: "https://example.com" },
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const token = extractSessionToken(res.headers.get("set-cookie"));
    expect(token).toBeTruthy();
  });

  it("disables Quick Demo Login when ADMIN_PASSWORD is configured in env", async () => {
    const originalPassword = env.ADMIN_PASSWORD;
    env.ADMIN_PASSWORD = "production-secret-password";
    try {
      const demoRes = await workerExports.default.fetch("https://example.com/auth/demo-login", {
        method: "POST",
        redirect: "manual",
        headers: { Origin: "https://example.com" },
      });
      expect(demoRes.status).toBe(403);

      const pageRes = await workerExports.default.fetch("https://example.com/auth");
      const html = await pageRes.text();
      expect(html).not.toContain("Quick Demo Login");
    } finally {
      env.ADMIN_PASSWORD = originalPassword;
    }
  });

  it("/auth/account redirects to /auth when no cookie is present", async () => {
    const res = await workerExports.default.fetch("https://example.com/auth/account", {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth");
  });

  it("rejects POST /auth/sign-out without same-origin", async () => {
    const token = await signInAsAdmin();
    const res = await workerExports.default.fetch("https://example.com/auth/sign-out", {
      method: "POST",
      headers: {
        Cookie: sessionCookieHeader(token),
        Origin: "https://attacker.example.com",
      },
      redirect: "manual",
    });
    expect(res.status).toBe(403);
    const followup = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: sessionCookieHeader(token) },
    });
    expect(followup.status).toBe(200);
  });

  it("clears the browser cookie on same-origin sign-out", async () => {
    const token = await signInAsAdmin();
    const res = await workerExports.default.fetch("https://example.com/auth/sign-out", {
      method: "POST",
      headers: {
        Cookie: sessionCookieHeader(token),
        Origin: "https://example.com",
      },
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_HEADER_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });

  it("treats a malformed session cookie as anonymous", async () => {
    const res = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: `${SESSION_COOKIE_HEADER_NAME}=garbage` },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth");
  });

  it("fails closed when SESSION_SECRET changes", async () => {
    const token = await signInAsAdmin();
    const original = env.SESSION_SECRET;
    env.SESSION_SECRET = "different-session-secret";
    try {
      const res = await workerExports.default.fetch("https://example.com/auth/account", {
        headers: { Cookie: sessionCookieHeader(token) },
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth");
    } finally {
      env.SESSION_SECRET = original;
    }
  });

  it("fails closed when SESSION_SECRET is empty", async () => {
    const token = await signInAsAdmin();
    const original = env.SESSION_SECRET;
    env.SESSION_SECRET = "";
    try {
      const res = await workerExports.default.fetch("https://example.com/auth/account", {
        headers: { Cookie: sessionCookieHeader(token) },
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth");
    } finally {
      env.SESSION_SECRET = original;
    }
  });
});
