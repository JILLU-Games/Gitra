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

describe("system admin panel & dedicated users management APIs", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("redirects unauthenticated GET /admin, /admin/users, and /admin/settings to /auth and returns 401 on APIs", async () => {
    const adminRes = await SELF.fetch(`${ORIGIN}/admin`, { redirect: "manual" });
    expect(adminRes.status).toBe(302);
    expect(adminRes.headers.get("location")).toBe("/auth?next=%2Fadmin");

    const usersRes = await SELF.fetch(`${ORIGIN}/admin/users`, { redirect: "manual" });
    expect(usersRes.status).toBe(302);
    expect(usersRes.headers.get("location")).toBe("/auth?next=%2Fadmin%2Fusers");

    const settingsRes = await SELF.fetch(`${ORIGIN}/admin/settings`, { redirect: "manual" });
    expect(settingsRes.status).toBe(302);
    expect(settingsRes.headers.get("location")).toBe("/auth?next=%2Fadmin%2Fsettings");

    const overviewApi = await SELF.fetch(`${ORIGIN}/admin/api/overview`);
    expect(overviewApi.status).toBe(401);

    const usersApi = await SELF.fetch(`${ORIGIN}/admin/api/users`);
    expect(usersApi.status).toBe(401);
  });

  it("renders Gitea-style public homepage, top header menus, /user/* settings, /admin/* control panel, and keeps /admin/edge-starter working", async () => {
    const cookie = await signInAsDemoAdmin();

    // Anonymous visitors see compact branding + public repos (and never private repos)
    const publicHomeRes = await SELF.fetch(`${ORIGIN}/`);
    expect(publicHomeRes.status).toBe(200);
    const publicHomeHtml = await publicHomeRes.text();
    expect(publicHomeHtml).toContain("git-on-cloudflare");
    expect(publicHomeHtml).toContain("Sign in");
    expect(publicHomeHtml).toContain("admin/edge-starter");
    expect(publicHomeHtml).not.toContain("admin/infra-notes");
    expect(publicHomeHtml).not.toContain("Site administration navigation");

    const exploreRes = await SELF.fetch(`${ORIGIN}/explore`);
    expect(exploreRes.status).toBe(200);
    const exploreHtml = await exploreRes.text();
    expect(exploreHtml).toContain("admin/edge-starter");
    expect(exploreHtml).not.toContain("admin/infra-notes");

    // Signed-in homepage has Gitea top-bar menus (+ Create, @admin dropdown) and no global sidebar
    const homeRes = await SELF.fetch(`${ORIGIN}/`, {
      headers: { Cookie: cookie },
    });
    expect(homeRes.status).toBe(200);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain("Repositories");
    expect(homeHtml).toContain("admin/edge-starter");
    expect(homeHtml).toContain("admin/infra-notes");
    expect(homeHtml).toContain("Create new");
    expect(homeHtml).toContain("Account menu");
    expect(homeHtml).not.toContain("Site administration navigation");

    // Dedicated /user/* directory routes with scoped User Settings sidebar
    const userIndexRes = await SELF.fetch(`${ORIGIN}/user`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(userIndexRes.status).toBe(302);
    expect(userIndexRes.headers.get("location")).toBe("/user/profile");

    for (const userPath of [
      "/user/profile",
      "/user/account",
      "/user/accounts",
      "/user/settings",
      "/user/settings/security",
      "/user/settings/tokens",
    ]) {
      const res = await SELF.fetch(`${ORIGIN}${userPath}`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("User settings navigation");
      expect(html).toContain("@admin");
    }

    // Dedicated /admin/* directory routes with scoped Site Administration sidebar
    const adminRes = await SELF.fetch(`${ORIGIN}/admin`, {
      headers: { Cookie: cookie },
    });
    expect(adminRes.status).toBe(200);
    const adminHtml = await adminRes.text();
    expect(adminHtml).toContain("Site Administration");
    expect(adminHtml).toContain("Total Repositories");
    expect(adminHtml).toContain("/admin/users");
    expect(adminHtml).toContain("/admin/settings");
    expect(adminHtml).toContain("Site administration navigation");

    const usersRes = await SELF.fetch(`${ORIGIN}/admin/users`, {
      headers: { Cookie: cookie },
    });
    expect(usersRes.status).toBe(200);
    const usersHtml = await usersRes.text();
    expect(usersHtml).toContain("Users");
    expect(usersHtml).toContain("Administrator");
    expect(usersHtml).toContain("@admin");
    expect(usersHtml).toContain("Site administration navigation");

    const settingsRes = await SELF.fetch(`${ORIGIN}/admin/settings`, {
      headers: { Cookie: cookie },
    });
    expect(settingsRes.status).toBe(200);
    const settingsHtml = await settingsRes.text();
    expect(settingsHtml).toContain("Settings Control Panel");
    expect(settingsHtml).toContain("Site administration navigation");

    const aliasRes = await SELF.fetch(`${ORIGIN}/admin/SettingsControlPanel`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(aliasRes.status).toBe(302);
    expect(aliasRes.headers.get("location")).toBe("/admin/settings");

    // Ensure two-segment /:owner/:repo under the `admin` namespace still works
    const repoRes = await SELF.fetch(`${ORIGIN}/admin/edge-starter`, {
      headers: { Cookie: cookie },
    });
    expect(repoRes.status).toBe(200);
    const repoHtml = await repoRes.text();
    expect(repoHtml).toContain("edge-starter");
    expect(repoHtml).toContain("Account menu");
  });

  it("supports full user CRUD (create, edit handle/name/role/status, protect primary admin, remove)", async () => {
    const cookie = await signInAsDemoAdmin();

    // Missing Origin header rejected (CSRF guard)
    const csrfRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "csrf-blocked",
        displayName: "Blocked User",
        role: "viewer",
        status: "active",
      }),
    });
    expect(csrfRes.status).toBe(403);

    // Create a viewer user with display name
    const createRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "@jane-ops",
        displayName: "Jane Morales",
        role: "viewer",
        status: "active",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      ok: true;
      user: {
        id: string;
        slug: string;
        displayName: string;
        role: string;
        status: string;
      };
    };
    expect(created.ok).toBe(true);
    expect(created.user.slug).toBe("jane-ops");
    expect(created.user.displayName).toBe("Jane Morales");
    expect(created.user.role).toBe("viewer");
    expect(created.user.status).toBe("active");

    // Duplicate handle rejected
    const dupRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "jane-ops",
        displayName: "Duplicate Jane",
        role: "member",
        status: "active",
      }),
    });
    expect(dupRes.status).toBe(409);

    // Edit user: rename handle, update display name, promote role to member, disable status
    const editRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${created.user.id}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "jane-m",
        displayName: "Jane M. Ops",
        role: "member",
        status: "disabled",
      }),
    });
    expect(editRes.status).toBe(200);
    const edited = (await editRes.json()) as {
      ok: true;
      slug: string;
      displayName: string;
      role: string;
      status: string;
    };
    expect(edited.slug).toBe("jane-m");
    expect(edited.displayName).toBe("Jane M. Ops");
    expect(edited.role).toBe("member");
    expect(edited.status).toBe("disabled");

    // Verify GET /admin/api/users reflects updated fields
    const listRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as {
      users: Array<{
        id: string;
        slug: string;
        displayName: string;
        role: string;
        status: string;
        isPrimaryAdmin: boolean;
      }>;
    };
    const foundJane = listed.users.find((u) => u.id === created.user.id);
    expect(foundJane).toBeTruthy();
    expect(foundJane?.slug).toBe("jane-m");
    expect(foundJane?.displayName).toBe("Jane M. Ops");
    expect(foundJane?.role).toBe("member");
    expect(foundJane?.status).toBe("disabled");

    // Primary admin can update displayName, but cannot be disabled, demoted, renamed, or deleted
    const primaryAdmin = listed.users.find((u) => u.isPrimaryAdmin);
    expect(primaryAdmin).toBeTruthy();

    const updatePrimaryName = await SELF.fetch(
      `${ORIGIN}/admin/api/users/${primaryAdmin!.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: "Primary Admin" }),
      }
    );
    expect(updatePrimaryName.status).toBe(200);

    const blockDisableRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${primaryAdmin!.id}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(blockDisableRes.status).toBe(400);

    const blockDemoteRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${primaryAdmin!.id}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "viewer" }),
    });
    expect(blockDemoteRes.status).toBe(400);

    const blockDeleteRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${primaryAdmin!.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
      },
    });
    expect(blockDeleteRes.status).toBe(403);

    // Removing the non-primary user succeeds
    const removeRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${created.user.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
      },
    });
    expect(removeRes.status).toBe(200);
  });

  it("deletes a repository from /admin/api/repositories/:id only after explicit confirmation", async () => {
    const cookie = await signInAsDemoAdmin();

    const createRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        namespaceSlug: "admin",
        slug: "temp-cleanup",
        visibility: "private",
      }),
    });
    expect(createRepoRes.status).toBe(200);
    const createdRepo = (await createRepoRes.json()) as { ok: true; id: string };

    const badConfirmRes = await SELF.fetch(
      `${ORIGIN}/admin/api/repositories/${createdRepo.id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "wrong/slug" }),
      }
    );
    expect(badConfirmRes.status).toBe(400);

    const deleteRes = await SELF.fetch(
      `${ORIGIN}/admin/api/repositories/${createdRepo.id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "admin/temp-cleanup" }),
      }
    );
    expect(deleteRes.status).toBe(200);

    const overviewRes = await SELF.fetch(`${ORIGIN}/admin/api/overview`, {
      headers: { Cookie: cookie },
    });
    const overview = (await overviewRes.json()) as {
      repositories: Array<{ id: string }>;
    };
    expect(overview.repositories.some((r) => r.id === createdRepo.id)).toBe(false);
  });

  it("supports directory user password login, self-service password change, disabled session revocation, and role-based access control", async () => {
    const adminCookie = await signInAsDemoAdmin();

    // 1. Create a member user with an initial password
    const createMemberRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "sarah-dev",
        displayName: "Sarah Lin",
        role: "member",
        status: "active",
        password: "InitialPass#2026",
      }),
    });
    expect(createMemberRes.status).toBe(201);
    const createdMember = (await createMemberRes.json()) as {
      ok: true;
      user: { id: string; slug: string; hasPassword: boolean };
    };
    expect(createdMember.user.hasPassword).toBe(true);

    // 2. Member signs in via POST /auth/login using @handle
    const memberLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "@sarah-dev",
        password: "InitialPass#2026",
      }).toString(),
    });
    expect(memberLoginRes.status).toBe(303);
    const memberToken = extractSessionToken(memberLoginRes.headers.get("set-cookie"));
    expect(memberToken).toBeTruthy();
    const memberCookie = sessionCookieHeader(memberToken!);

    // 3. Member can view / and /auth/account, but is blocked from /admin and /admin/api/*
    const memberAccountRes = await SELF.fetch(`${ORIGIN}/auth/account`, {
      headers: { Cookie: memberCookie },
    });
    expect(memberAccountRes.status).toBe(200);
    const memberAccountHtml = await memberAccountRes.text();
    expect(memberAccountHtml).toContain("@sarah-dev");
    expect(memberAccountHtml).toContain("Change password");
    expect(memberAccountHtml).not.toContain("/admin/users");

    const memberAdminHtmlRes = await SELF.fetch(`${ORIGIN}/admin`, {
      headers: { Cookie: memberCookie },
      redirect: "manual",
    });
    expect(memberAdminHtmlRes.status).toBe(303);
    expect(memberAdminHtmlRes.headers.get("location")).toBe("/");

    const memberAdminSettingsRes = await SELF.fetch(`${ORIGIN}/admin/settings`, {
      headers: { Cookie: memberCookie },
      redirect: "manual",
    });
    expect(memberAdminSettingsRes.status).toBe(303);
    expect(memberAdminSettingsRes.headers.get("location")).toBe("/");

    const memberAdminApiRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      headers: { Cookie: memberCookie },
    });
    expect(memberAdminApiRes.status).toBe(403);

    // 4. Member updates their own password via POST /auth/api/change-password
    const badChangeRes = await SELF.fetch(`${ORIGIN}/auth/api/change-password`, {
      method: "POST",
      headers: {
        Cookie: memberCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "WrongCurrentPassword",
        newPassword: "UpdatedPass#2026",
      }),
    });
    expect(badChangeRes.status).toBe(400);

    const goodChangeRes = await SELF.fetch(`${ORIGIN}/auth/api/change-password`, {
      method: "POST",
      headers: {
        Cookie: memberCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "InitialPass#2026",
        newPassword: "UpdatedPass#2026",
      }),
    });
    expect(goodChangeRes.status).toBe(200);

    // Old password rejected, new password accepted
    const oldPwLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "sarah-dev",
        password: "InitialPass#2026",
      }).toString(),
    });
    expect(oldPwLoginRes.status).toBe(303);
    expect(oldPwLoginRes.headers.get("location")).toBe("/auth?error=invalid_credentials");

    const newPwLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "sarah-dev",
        password: "UpdatedPass#2026",
      }).toString(),
    });
    expect(newPwLoginRes.status).toBe(303);
    const refreshedMemberCookie = sessionCookieHeader(
      extractSessionToken(newPwLoginRes.headers.get("set-cookie"))!
    );

    // 5. Admin disables the user -> active session is immediately revoked AND fresh login is blocked
    const disableRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${createdMember.user.id}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(disableRes.status).toBe(200);

    const revokedSessionRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
      headers: { Cookie: refreshedMemberCookie },
    });
    expect(revokedSessionRes.status).toBe(401);

    const disabledLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "sarah-dev",
        password: "UpdatedPass#2026",
      }).toString(),
    });
    expect(disabledLoginRes.status).toBe(303);
    expect(disabledLoginRes.headers.get("location")).toBe("/auth?error=account_disabled");

    // 6. Admin re-enables and resets password -> user can sign in with reset password
    const resetRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${createdMember.user.id}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "active", password: "ResetByAdmin#2026" }),
    });
    expect(resetRes.status).toBe(200);

    const postResetLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "sarah-dev",
        password: "ResetByAdmin#2026",
      }).toString(),
    });
    expect(postResetLoginRes.status).toBe(303);
    expect(extractSessionToken(postResetLoginRes.headers.get("set-cookie"))).toBeTruthy();

    // 7. Create a viewer user and verify read-only enforcement on repos and push PATs
    const createViewerRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "audit-viewer",
        displayName: "Audit Viewer",
        role: "viewer",
        status: "active",
        password: "ViewerPass#2026",
      }),
    });
    expect(createViewerRes.status).toBe(201);
    const createdViewer = (await createViewerRes.json()) as { ok: true; user: { id: string } };

    const viewerLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "audit-viewer",
        password: "ViewerPass#2026",
      }).toString(),
    });
    expect(viewerLoginRes.status).toBe(303);
    const viewerCookie = sessionCookieHeader(
      extractSessionToken(viewerLoginRes.headers.get("set-cookie"))!
    );

    const viewerRepoCreateRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: {
        Cookie: viewerCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        namespaceSlug: "audit-viewer",
        slug: "blocked-repo",
        visibility: "private",
      }),
    });
    expect(viewerRepoCreateRes.status).toBe(403);

    const viewerPushPatRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
      method: "POST",
      headers: {
        Cookie: viewerCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "namespace",
        name: "blocked-push-token",
        namespaceSlug: "audit-viewer",
        level: "push",
      }),
    });
    expect(viewerPushPatRes.status).toBe(403);

    const viewerPullPatRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
      method: "POST",
      headers: {
        Cookie: viewerCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "namespace",
        name: "allowed-pull-token",
        namespaceSlug: "audit-viewer",
        level: "pull",
      }),
    });
    expect(viewerPullPatRes.status).toBe(200);

    // Cleanup created test users
    await SELF.fetch(`${ORIGIN}/admin/api/users/${createdMember.user.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    });
    await SELF.fetch(`${ORIGIN}/admin/api/users/${createdViewer.user.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    });
  });
});
