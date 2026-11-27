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

async function createAndSignInUser(
  adminCookie: string,
  opts: { handle: string; displayName: string; role: "member" | "viewer"; password: string }
): Promise<{ userId: string; cookie: string }> {
  const createRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      Origin: ORIGIN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      handle: opts.handle,
      displayName: opts.displayName,
      role: opts.role,
      status: "active",
      password: opts.password,
    }),
  });
  expect(createRes.status).toBe(201);
  const created = (await createRes.json()) as { ok: true; user: { id: string } };

  const loginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN,
    },
    body: new URLSearchParams({
      username: opts.handle,
      password: opts.password,
    }).toString(),
  });
  expect(loginRes.status).toBe(303);
  const token = extractSessionToken(loginRes.headers.get("set-cookie"));
  expect(token).toBeTruthy();
  return { userId: created.user.id, cookie: sessionCookieHeader(token!) };
}

describe("GitHub/Gitea code view, web file editor, pinning, and rich profile", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("supports README init, in-browser file commits, blob Edit file permissions, pinning, and profile metadata", async () => {
    const adminCookie = await signInAsDemoAdmin();
    const member = await createAndSignInUser(adminCookie, {
      handle: "coder-one",
      displayName: "Coder One",
      role: "member",
      password: "CoderPassword#2026",
    });
    const viewer = await createAndSignInUser(adminCookie, {
      handle: "reader-one",
      displayName: "Reader One",
      role: "viewer",
      password: "ReaderPassword#2026",
    });

    try {
      // 1. Create repository with description + initializeReadme
      const createRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
        method: "POST",
        headers: {
          Cookie: member.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespaceSlug: "coder-one",
          slug: "edge-router",
          visibility: "public",
          description: "Zero-overhead edge router for Workers",
          initializeReadme: true,
        }),
      });
      expect(createRepoRes.status).toBe(200);
      const repo = (await createRepoRes.json()) as {
        ok: true;
        id: string;
        description: string;
        readmeInitialized: boolean;
      };
      expect(repo.description).toBe("Zero-overhead edge router for Workers");
      expect(repo.readmeInitialized).toBe(true);

      // Verify repo overview page shows root tree README.md, About description, Code, Add file, and owner Settings tab
      const overviewRes = await SELF.fetch(`${ORIGIN}/coder-one/edge-router`, {
        headers: { Cookie: member.cookie },
      });
      expect(overviewRes.status).toBe(200);
      const overviewHtml = await overviewRes.text();
      expect(overviewHtml).toContain("README.md");
      expect(overviewHtml).toContain("Zero-overhead edge router for Workers");
      expect(overviewHtml).toContain("Code");
      expect(overviewHtml).toContain("Add file");
      expect(overviewHtml).toContain('href="/coder-one/edge-router/admin"');

      // Anonymous visitor and read-only viewer must NOT see repo Settings/Admin tab on overview, tree, or commits
      const anonOverviewRes = await SELF.fetch(`${ORIGIN}/coder-one/edge-router`);
      expect(anonOverviewRes.status).toBe(200);
      const anonOverviewHtml = await anonOverviewRes.text();
      expect(anonOverviewHtml).not.toContain('href="/coder-one/edge-router/admin"');

      const viewerOverviewRes = await SELF.fetch(`${ORIGIN}/coder-one/edge-router`, {
        headers: { Cookie: viewer.cookie },
      });
      expect(viewerOverviewRes.status).toBe(200);
      const viewerOverviewHtml = await viewerOverviewRes.text();
      expect(viewerOverviewHtml).not.toContain('href="/coder-one/edge-router/admin"');

      const anonCommitsRes = await SELF.fetch(`${ORIGIN}/coder-one/edge-router/commits?ref=main`);
      expect(anonCommitsRes.status).toBe(200);
      expect(await anonCommitsRes.text()).not.toContain('href="/coder-one/edge-router/admin"');

      // 2. Commit a new nested file via PUT /auth/api/repositories/:id/file
      const commitFileRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${repo.id}/file`, {
        method: "PUT",
        headers: {
          Cookie: member.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "src/hello.ts",
          content: 'export const greeting = "hello edge";\n',
          message: "Add src/hello.ts",
          ref: "main",
        }),
      });
      expect(commitFileRes.status).toBe(200);
      const committed = (await commitFileRes.json()) as {
        ok: true;
        path: string;
        commitOid: string;
      };
      expect(committed.ok).toBe(true);
      expect(committed.path).toBe("src/hello.ts");
      expect(committed.commitOid).toMatch(/^[0-9a-f]{40}$/);

      // Overview now lists `src` directory and `README.md`
      const updatedOverviewRes = await SELF.fetch(`${ORIGIN}/coder-one/edge-router`, {
        headers: { Cookie: member.cookie },
      });
      expect(updatedOverviewRes.status).toBe(200);
      const updatedOverviewHtml = await updatedOverviewRes.text();
      expect(updatedOverviewHtml).toContain("src");
      expect(updatedOverviewHtml).toContain("README.md");

      // Blob view for writer includes Edit file and Settings tab, while anonymous visitor does not
      const writerBlobRes = await SELF.fetch(
        `${ORIGIN}/coder-one/edge-router/blob?ref=main&path=src%2Fhello.ts`,
        { headers: { Cookie: member.cookie } }
      );
      expect(writerBlobRes.status).toBe(200);
      const writerBlobHtml = await writerBlobRes.text();
      expect(writerBlobHtml).toContain("Edit file");
      expect(writerBlobHtml).toContain("hello edge");
      expect(writerBlobHtml).toContain('href="/coder-one/edge-router/admin"');

      const anonBlobRes = await SELF.fetch(
        `${ORIGIN}/coder-one/edge-router/blob?ref=main&path=src%2Fhello.ts`
      );
      expect(anonBlobRes.status).toBe(200);
      const anonBlobHtml = await anonBlobRes.text();
      expect(anonBlobHtml).not.toContain("Edit file");
      expect(anonBlobHtml).not.toContain('href="/coder-one/edge-router/admin"');

      // 3. Pin repo and refine description via PATCH /auth/api/repositories/:id
      const patchRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${repo.id}`, {
        method: "PATCH",
        headers: {
          Cookie: member.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: "Fast Cloudflare edge router",
          pinned: true,
        }),
      });
      expect(patchRes.status).toBe(200);
      const patched = (await patchRes.json()) as {
        ok: true;
        description: string;
        pinned: boolean;
      };
      expect(patched.description).toBe("Fast Cloudflare edge router");
      expect(patched.pinned).toBe(true);

      // 4. Update member profile metadata via PUT /auth/api/profile
      const profileRes = await SELF.fetch(`${ORIGIN}/auth/api/profile`, {
        method: "PUT",
        headers: {
          Cookie: member.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Coder One HQ",
          bio: "Building distributed Git tooling on Workers.",
          location: "Dhaka",
          website: "vibtools.dev",
        }),
      });
      expect(profileRes.status).toBe(200);
      const profileData = (await profileRes.json()) as {
        ok: true;
        displayName: string;
        bio: string;
        location: string;
        website: string;
      };
      expect(profileData.displayName).toBe("Coder One HQ");
      expect(profileData.website).toBe("https://vibtools.dev");

      // Owner profile page renders bio, location, website, and pinned description without role pill
      const ownerPageRes = await SELF.fetch(`${ORIGIN}/coder-one`);
      expect(ownerPageRes.status).toBe(200);
      const ownerHtml = await ownerPageRes.text();
      expect(ownerHtml).toContain("Coder One HQ");
      expect(ownerHtml).toContain("Building distributed Git tooling on Workers.");
      expect(ownerHtml).toContain("Dhaka");
      expect(ownerHtml).toContain("https://vibtools.dev");
      expect(ownerHtml).toContain("Fast Cloudflare edge router");
      expect(ownerHtml).toContain("Pinned");
      expect(ownerHtml).not.toContain(">member<");

      // Public homepage (anonymous GET /) and /explore render neutral default portal, real derived language, and teams directory
      const anonHomeRes = await SELF.fetch(`${ORIGIN}/`);
      expect(anonHomeRes.status).toBe(200);
      const anonHomeHtml = await anonHomeRes.text();
      expect(anonHomeHtml).toContain("Open-Source Git Forge");
      expect(anonHomeHtml).toContain("Open-Source Repositories");
      expect(anonHomeHtml).toContain("Pinned Repositories");
      expect(anonHomeHtml).toContain("· Organization");
      expect(anonHomeHtml).toContain("Teams &amp; Namespaces");
      expect(anonHomeHtml).toContain("Developer Access");
      expect(anonHomeHtml).toContain("TypeScript");
      expect(anonHomeHtml).not.toContain("Vib Tools Open-Source Repositories");
      expect(anonHomeHtml).toContain("Fast Cloudflare edge router");
      expect(anonHomeHtml).toContain("Coder One HQ");

      const exploreRes = await SELF.fetch(`${ORIGIN}/explore`);
      expect(exploreRes.status).toBe(200);
      const exploreHtml = await exploreRes.text();
      expect(exploreHtml).toContain("Open-Source Repositories");
      expect(exploreHtml).toContain("Pinned Repositories");
      expect(exploreHtml).toContain("· Organization");
      expect(exploreHtml).toContain("Teams &amp; Namespaces");
      expect(exploreHtml).toContain("Fast Cloudflare edge router");
      expect(exploreHtml).toContain("/coder-one");

      // 5. Negative tests: viewer/anon blocked on PUT .../file & PATCH ..., traversal path rejected
      const anonPutRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${repo.id}/file`, {
        method: "PUT",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ path: "README.md", content: "hacked" }),
      });
      expect(anonPutRes.status).toBe(401);

      const viewerPutRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${repo.id}/file`, {
        method: "PUT",
        headers: {
          Cookie: viewer.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "README.md", content: "blocked" }),
      });
      expect(viewerPutRes.status).toBe(403);

      const viewerPatchRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${repo.id}`, {
        method: "PATCH",
        headers: {
          Cookie: viewer.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pinned: false }),
      });
      expect(viewerPatchRes.status).toBe(403);

      const traversalRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${repo.id}/file`, {
        method: "PUT",
        headers: {
          Cookie: member.cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "../secret", content: "nope" }),
      });
      expect(traversalRes.status).toBe(400);
      const traversalBody = (await traversalRes.json()) as { ok: false; reason: string };
      expect(traversalBody.reason).toBe("invalid-path");
    } finally {
      await SELF.fetch(`${ORIGIN}/admin/api/users/${member.userId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
      await SELF.fetch(`${ORIGIN}/admin/api/users/${viewer.userId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
    }
  });
});
