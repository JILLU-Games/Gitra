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

describe(".vibtools namespace profile repository & profile/README.md", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("creates .vibtools, commits profile/README.md, renders compact profile on /:owner, and enforces private visibility", async () => {
    const adminCookie = await signInAsDemoAdmin();

    // 1. Create a clean org/user namespace `vibtoolshq`
    const createUserRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "vibtoolshq",
        displayName: "VibTools HQ",
        role: "member",
        status: "active",
        password: "VibToolsPass#2026",
      }),
    });
    expect(createUserRes.status).toBe(201);
    const createdUser = (await createUserRes.json()) as { ok: true; user: { id: string } };

    // Sign in as @vibtoolshq
    const loginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "vibtoolshq",
        password: "VibToolsPass#2026",
      }).toString(),
    });
    expect(loginRes.status).toBe(303);
    const memberCookie = sessionCookieHeader(
      extractSessionToken(loginRes.headers.get("set-cookie"))!
    );

    // 2. Create `.vibtools` repository with starter `profile/README.md`
    const createProfileRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: {
        Cookie: memberCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        namespaceSlug: "vibtoolshq",
        slug: ".vibtools",
        visibility: "public",
        initializeProfileReadme: true,
      }),
    });
    expect(createProfileRepoRes.status).toBe(200);
    const createdRepo = (await createProfileRepoRes.json()) as {
      ok: true;
      id: string;
      slug: string;
      namespaceSlug: string;
      profileReadmeInitialized: boolean;
    };
    expect(createdRepo.slug).toBe(".vibtools");
    expect(createdRepo.profileReadmeInitialized).toBe(true);

    // Verify public GET /vibtoolshq shows starter profile README without exposing internal role pill
    const initialProfilePage = await SELF.fetch(`${ORIGIN}/vibtoolshq`);
    expect(initialProfilePage.status).toBe(200);
    const initialHtml = await initialProfilePage.text();
    expect(initialHtml).toContain("VibTools HQ");
    expect(initialHtml).toContain("@vibtoolshq");
    expect(initialHtml).toContain("vibtoolshq/.vibtools");
    expect(initialHtml).toContain("profile/README.md");
    expect(initialHtml).not.toContain(">member<");

    // 3. Edit `profile/README.md` via PUT /auth/api/repositories/:id/profile-readme
    const customMarkdown = [
      "# VibTools Open Engineering",
      "",
      "Edge-native developer tooling and infrastructure kits.",
      "",
      "- **Runtime:** Cloudflare Workers + Durable Objects",
      "- **Profile:** Powered by `.vibtools/profile/README.md`",
    ].join("\n");

    const updateReadmeRes = await SELF.fetch(
      `${ORIGIN}/auth/api/repositories/${createdRepo.id}/profile-readme`,
      {
        method: "PUT",
        headers: {
          Cookie: memberCookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: customMarkdown,
          message: "Customize VibTools HQ org profile",
        }),
      }
    );
    expect(updateReadmeRes.status).toBe(200);
    const updateBody = (await updateReadmeRes.json()) as {
      ok: true;
      commitOid: string;
      unchanged: boolean;
    };
    expect(updateBody.ok).toBe(true);
    expect(updateBody.unchanged).toBe(false);
    expect(updateBody.commitOid).toMatch(/^[0-9a-f]{40}$/);

    // Verify updated profile renders on both GET /vibtoolshq and blob view
    const updatedProfilePage = await SELF.fetch(`${ORIGIN}/vibtoolshq`);
    expect(updatedProfilePage.status).toBe(200);
    const updatedHtml = await updatedProfilePage.text();
    expect(updatedHtml).toContain("VibTools Open Engineering");
    expect(updatedHtml).toContain("Edge-native developer tooling and infrastructure kits.");

    const blobRes = await SELF.fetch(
      `${ORIGIN}/vibtoolshq/.vibtools/blob?ref=main&path=profile%2FREADME.md`
    );
    expect(blobRes.status).toBe(200);
    const blobHtml = await blobRes.text();
    expect(blobHtml).toContain("VibTools Open Engineering");

    // Repo overview for owner includes the Profile README editor
    const repoOverviewRes = await SELF.fetch(`${ORIGIN}/vibtoolshq/.vibtools`, {
      headers: { Cookie: memberCookie },
    });
    expect(repoOverviewRes.status).toBe(200);
    const repoOverviewHtml = await repoOverviewRes.text();
    expect(repoOverviewHtml).toContain("Namespace Profile Repository");
    expect(repoOverviewHtml).toContain("Save &amp; commit");

    // 4. Privacy check: flipping .vibtools to private hides profile/README.md from anonymous visitors
    const hideRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${createdRepo.id}`, {
      method: "PATCH",
      headers: {
        Cookie: memberCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visibility: "private" }),
    });
    expect(hideRes.status).toBe(200);

    const anonPrivateRes = await SELF.fetch(`${ORIGIN}/vibtoolshq`);
    expect(anonPrivateRes.status).toBe(200);
    const anonPrivateHtml = await anonPrivateRes.text();
    expect(anonPrivateHtml).not.toContain("VibTools Open Engineering");
    expect(anonPrivateHtml).not.toContain("vibtoolshq/.vibtools");

    const memberPrivateRes = await SELF.fetch(`${ORIGIN}/vibtoolshq`, {
      headers: { Cookie: memberCookie },
    });
    expect(memberPrivateRes.status).toBe(200);
    const memberPrivateHtml = await memberPrivateRes.text();
    expect(memberPrivateHtml).toContain("VibTools Open Engineering");

    // 5. Verify /profile/admin renders @admin's owner profile without shadowing /admin Control Panel
    const adminProfileRes = await SELF.fetch(`${ORIGIN}/profile/admin`, {
      headers: { Cookie: adminCookie },
    });
    expect(adminProfileRes.status).toBe(200);
    const adminProfileHtml = await adminProfileRes.text();
    expect(adminProfileHtml).toContain("@admin");
    expect(adminProfileHtml).toContain("Create .vibtools profile");

    // Cleanup test namespace
    await SELF.fetch(`${ORIGIN}/admin/api/users/${createdUser.user.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    });
  });
});
