import { applyD1Migrations } from "cloudflare:test";
import { env, exports as workerExports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { newPrefixedId } from "@/worker/common";
import { SESSION_COOKIE_HEADER_NAME } from "@/worker/auth/cookies";
import { createDb } from "@/worker/db/d1/client";
import {
  insertMembershipIfMissing,
  insertUserIfNew,
  upsertNamespaceDirectoryMeta,
} from "@/worker/db/d1/dal";

import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { readAppD1Migrations } from "./util/d1Migrations";
import { mintSessionCookie, setupRepoForTests } from "./util/repoSeed";

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

  it("revokes session when user account is disabled in namespace directory meta", async () => {
    const owner = `sess-dis-${Math.random().toString(36).slice(2, 8)}`;
    const seeded = await setupRepoForTests(env, owner, "site");
    await upsertNamespaceDirectoryMeta(env.DB, seeded.namespaceId, {
      displayName: owner,
      role: "member",
      status: "disabled",
      now: Date.now(),
    });

    const res = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: seeded.cookieHeader },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth");
  });

  it("defaults users without a directory account row to least-privilege viewer role", async () => {
    const owner = `sess-ns-${Math.random().toString(36).slice(2, 8)}`;
    const seeded = await setupRepoForTests(env, owner, "site", { visibility: "public" });
    const db = createDb(env.DB);
    const userId = newPrefixedId("user");
    await insertUserIfNew(db, {
      id: userId,
      tesseraSub: `nodir-${userId}`,
      createdAt: Date.now(),
    });
    await insertMembershipIfMissing(db, {
      namespaceId: seeded.namespaceId,
      userId,
      createdAt: Date.now(),
    });
    const cookie = await mintSessionCookie(env, userId);

    // A user with no directory account row falls back to viewer (403 on admin UI).
    const res = await workerExports.default.fetch(`https://example.com/${owner}/site/admin`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(res.status).toBe(403);
  });

  it("fails closed when D1 directory metadata lookup throws", async () => {
    const owner = `sess-err-${Math.random().toString(36).slice(2, 8)}`;
    const seeded = await setupRepoForTests(env, owner, "site");

    const origPrepare = env.DB.prepare.bind(env.DB);
    const spy = vi.spyOn(env.DB, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("namespace_directory_meta")) {
        throw new Error("Simulated D1 outage");
      }
      return origPrepare(sql);
    });
    try {
      const res = await workerExports.default.fetch("https://example.com/auth/account", {
        headers: { Cookie: seeded.cookieHeader },
        redirect: "manual",
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth");
    } finally {
      spy.mockRestore();
    }
  });

  it("invalidates session cookies when account session_epoch is bumped", async () => {
    const owner = `sess-epoch-${Math.random().toString(36).slice(2, 8)}`;
    const seeded = await setupRepoForTests(env, owner, "site");
    // Ensure initial directory row exists with epoch 1
    await upsertNamespaceDirectoryMeta(env.DB, seeded.namespaceId, {
      displayName: owner,
      role: "member",
      status: "active",
      now: Date.now(),
    });

    const res1 = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: seeded.cookieHeader },
      redirect: "manual",
    });
    expect(res1.status).toBe(200);

    // Bump sessionEpoch in directory meta (simulates password reset or rotation)
    await upsertNamespaceDirectoryMeta(env.DB, seeded.namespaceId, {
      displayName: owner,
      role: "member",
      status: "active",
      bumpSessionEpoch: true,
      now: Date.now(),
    });

    // Earlier minted cookie with previous epoch fails closed
    const res2 = await workerExports.default.fetch("https://example.com/auth/account", {
      headers: { Cookie: seeded.cookieHeader },
      redirect: "manual",
    });
    expect(res2.status).toBe(302);
    expect(res2.headers.get("location")).toBe("/auth");
  });

  it("issues plain HTTP session cookie without Secure or __Host- when connection is not HTTPS", async () => {
    const form = new URLSearchParams({ username: "admin", password: "admin123" });
    const loginRes = await workerExports.default.fetch("http://localhost:3000/auth/login", {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: form.toString(),
    });
    expect(loginRes.status).toBe(303);
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const sessionCookiePart = setCookie
      .split(",")
      .find((part) => part.trim().startsWith("goc_session="));
    expect(sessionCookiePart).toBeTruthy();
    expect(sessionCookiePart).not.toContain("Secure");
    expect(sessionCookiePart).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("__Host-goc_session=");

    const tokenMatch = sessionCookiePart?.match(/goc_session=([^;]+)/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];

    const accountRes = await workerExports.default.fetch("http://localhost:3000/auth/account", {
      headers: { Cookie: `goc_session=${token}` },
    });
    expect(accountRes.status).toBe(200);
  });
});
