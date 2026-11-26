import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createDb } from "@/worker/db/d1/client";
import { namespaceMemberships } from "@/worker/db/d1/schema/namespaceMemberships";
import { and, eq } from "drizzle-orm";
import { doPrefix } from "@/worker/keys";
import { routeCacheKey } from "@/worker/repositories/routeCache";
import type { RepositoryDeleteMessage } from "@/worker/tasks/queue";
import { getRepoStub } from "@/worker/common";

import { ensureD1Migrations } from "./util/d1Setup";
import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { createQueueSendResponse, runQueueMessage } from "./util/queue";

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

    const reposRes = await SELF.fetch(`${ORIGIN}/admin/repositories`, { redirect: "manual" });
    expect(reposRes.status).toBe(302);
    expect(reposRes.headers.get("location")).toBe("/auth?next=%2Fadmin%2Frepositories");

    const tokensRes = await SELF.fetch(`${ORIGIN}/admin/tokens`, { redirect: "manual" });
    expect(tokensRes.status).toBe(302);
    expect(tokensRes.headers.get("location")).toBe("/auth?next=%2Fadmin%2Ftokens");

    const securityRes = await SELF.fetch(`${ORIGIN}/admin/security`, { redirect: "manual" });
    expect(securityRes.status).toBe(302);
    expect(securityRes.headers.get("location")).toBe("/auth?next=%2Fadmin%2Fsecurity");

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
    expect(adminHtml).toContain("/admin/repositories");
    expect(adminHtml).toContain("/admin/tokens");
    expect(adminHtml).toContain("/admin/settings");
    expect(adminHtml).toContain("/admin/security");
    expect(adminHtml).toContain("Site administration navigation");

    const usersRes = await SELF.fetch(`${ORIGIN}/admin/users`, {
      headers: { Cookie: cookie },
    });
    expect(usersRes.status).toBe(200);
    const usersHtml = await usersRes.text();
    expect(usersHtml).toContain("Users &amp; Accounts");
    expect(usersHtml).toContain("Administrator");
    expect(usersHtml).toContain("@admin");
    expect(usersHtml).toContain("Site administration navigation");

    const adminReposRes = await SELF.fetch(`${ORIGIN}/admin/repositories`, {
      headers: { Cookie: cookie },
    });
    expect(adminReposRes.status).toBe(200);
    const adminReposHtml = await adminReposRes.text();
    expect(adminReposHtml).toContain("Repositories");
    expect(adminReposHtml).toContain("admin/edge-starter");
    expect(adminReposHtml).toContain("Site administration navigation");

    const adminTokensRes = await SELF.fetch(`${ORIGIN}/admin/tokens`, {
      headers: { Cookie: cookie },
    });
    expect(adminTokensRes.status).toBe(200);
    const adminTokensHtml = await adminTokensRes.text();
    expect(adminTokensHtml).toContain("Access Tokens");
    expect(adminTokensHtml).toContain("Site administration navigation");

    const settingsRes = await SELF.fetch(`${ORIGIN}/admin/settings`, {
      headers: { Cookie: cookie },
    });
    expect(settingsRes.status).toBe(200);
    const settingsHtml = await settingsRes.text();
    expect(settingsHtml).toContain("Settings Control Panel");
    expect(settingsHtml).toContain("Site administration navigation");

    const securityRes = await SELF.fetch(`${ORIGIN}/admin/security`, {
      headers: { Cookie: cookie },
    });
    expect(securityRes.status).toBe(200);
    const securityHtml = await securityRes.text();
    expect(securityHtml).toContain("Role-Based Access Control (RBAC) Matrix");
    expect(securityHtml).toContain("Site administration navigation");

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

    // Primary admin can update displayName and public @namespace handle,
    // but cannot be disabled, demoted, password-overridden, or deleted.
    const primaryAdmin = listed.users.find((u) => u.isPrimaryAdmin);
    expect(primaryAdmin).toBeTruthy();

    const updatePrimaryName = await SELF.fetch(`${ORIGIN}/admin/api/users/${primaryAdmin!.id}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Primary Admin" }),
    });
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

  it("renames primary admin public @namespace cleanly while keeping sign-in bound to ADMIN_USERNAME", async () => {
    const cookie = await signInAsDemoAdmin();

    // Ensure at least one repository exists under the initial primary admin namespace
    const createRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        namespaceSlug: "admin",
        slug: "brand-core",
        visibility: "public",
      }),
    });
    expect(createRepoRes.status).toBe(200);

    const listBefore = (await (
      await SELF.fetch(`${ORIGIN}/admin/api/users`, { headers: { Cookie: cookie } })
    ).json()) as { users: Array<{ id: string; slug: string; isPrimaryAdmin: boolean }> };
    const primaryAdmin = listBefore.users.find((u) => u.isPrimaryAdmin);
    expect(primaryAdmin).toBeTruthy();

    // Rename primary admin public Git namespace from @admin -> @vibtools-org
    const renameRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${primaryAdmin!.id}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "vibtools-org",
        displayName: "Vib Tools Core",
      }),
    });
    expect(renameRes.status).toBe(200);
    const renameBody = (await renameRes.json()) as { ok: boolean; slug: string };
    expect(renameBody).toMatchObject({ ok: true, slug: "vibtools-org" });

    // Primary admin remains recognized as isPrimaryAdmin under the renamed slug
    const listAfter = (await (
      await SELF.fetch(`${ORIGIN}/admin/api/users`, { headers: { Cookie: cookie } })
    ).json()) as { users: Array<{ id: string; slug: string; isPrimaryAdmin: boolean }> };
    const renamedPrimary = listAfter.users.find((u) => u.id === primaryAdmin!.id);
    expect(renamedPrimary).toMatchObject({ slug: "vibtools-org", isPrimaryAdmin: true });

    // /admin/settings reflects both private sign-in username and renamed public namespace
    const settingsHtml = await (
      await SELF.fetch(`${ORIGIN}/admin/settings`, { headers: { Cookie: cookie } })
    ).text();
    expect(settingsHtml).toContain("@vibtools-org");
    expect(settingsHtml).toContain("Admin Sign-in Username");

    // Repository resolves under the renamed public namespace and old @admin/<repo> returns 404
    const newRepoPage = await SELF.fetch(`${ORIGIN}/vibtools-org/brand-core`);
    expect(newRepoPage.status).toBe(200);
    const oldRepoPage = await SELF.fetch(`${ORIGIN}/admin/brand-core`);
    expect(oldRepoPage.status).toBe(404);

    // Sign out and verify the renamed public handle cannot be used to sign in
    await SELF.fetch(`${ORIGIN}/auth/sign-out`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: ORIGIN },
    });

    const publicHandleLogin = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ username: "vibtools-org", password: "admin123" }).toString(),
      redirect: "manual",
    });
    expect(publicHandleLogin.status).toBe(303);
    expect(publicHandleLogin.headers.get("location")).toContain("error=invalid_credentials");

    // Signing back in with ADMIN_USERNAME succeeds and preserves @vibtools-org without recreating @admin
    const reloginCookie = await signInAsDemoAdmin();
    const listAfterRelogin = (await (
      await SELF.fetch(`${ORIGIN}/admin/api/users`, { headers: { Cookie: reloginCookie } })
    ).json()) as { users: Array<{ id: string; slug: string; isPrimaryAdmin: boolean }> };
    expect(listAfterRelogin.users.some((u) => u.slug === "admin")).toBe(false);
    expect(listAfterRelogin.users.find((u) => u.isPrimaryAdmin)?.slug).toBe("vibtools-org");

    // Restore @admin handle so subsequent shared-D1 tests in this suite retain the default fixture
    const restoreRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${primaryAdmin!.id}`, {
      method: "PATCH",
      headers: {
        Cookie: reloginCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handle: "admin", displayName: "Administrator" }),
    });
    expect(restoreRes.status).toBe(200);
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
    const createdRepo = (await createRepoRes.json()) as {
      ok: true;
      id: string;
      defaultBranch: string;
    };
    expect(createdRepo.defaultBranch).toBe("main");

    const badConfirmRes = await SELF.fetch(`${ORIGIN}/admin/api/repositories/${createdRepo.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: "wrong/slug" }),
    });
    expect(badConfirmRes.status).toBe(400);

    // Queue send outage must fail closed with 503 without mutating D1.
    const failSpy = vi
      .spyOn(env.REPO_TASKS_QUEUE, "send")
      .mockRejectedValueOnce(new Error("queue down"));
    const outageRes = await SELF.fetch(`${ORIGIN}/admin/api/repositories/${createdRepo.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: "admin/temp-cleanup" }),
    });
    expect(outageRes.status).toBe(503);
    failSpy.mockRestore();

    const sentMessages: unknown[] = [];
    const sendSpy = vi
      .spyOn(env.REPO_TASKS_QUEUE, "send")
      .mockImplementation(async (message: unknown) => {
        sentMessages.push(message);
        return createQueueSendResponse();
      });

    const deleteRes = await SELF.fetch(`${ORIGIN}/admin/api/repositories/${createdRepo.id}`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: "admin/temp-cleanup" }),
    });
    sendSpy.mockRestore();
    expect(deleteRes.status).toBe(202);
    expect(await deleteRes.json()).toEqual({ ok: true, id: createdRepo.id, queued: true });
    expect(sentMessages.length).toBe(1);
    expect((sentMessages[0] as RepositoryDeleteMessage).kind).toBe("repository-delete");

    // Drive queue consumer so D1, ROUTES KV, R2, and DO cleanup complete.
    const queueResult = await runQueueMessage(sentMessages[0]);
    expect(queueResult.acked).toBe(true);

    const overviewRes = await SELF.fetch(`${ORIGIN}/admin/api/overview`, {
      headers: { Cookie: cookie },
    });
    const overview = (await overviewRes.json()) as {
      repositories: Array<{ id: string }>;
    };
    expect(overview.repositories.some((r) => r.id === createdRepo.id)).toBe(false);
    expect(await env.ROUTES.get(routeCacheKey("admin", "temp-cleanup"))).toBeNull();
  });

  it("allows admins to create, tokenize, and atomically delete repos and users across other namespaces", async () => {
    const adminCookie = await signInAsDemoAdmin();
    const createUserRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "cross-ns-owner",
        displayName: "Cross NS Owner",
        role: "member",
        status: "active",
      }),
    });
    expect(createUserRes.status).toBe(201);
    const createdUser = (await createUserRes.json()) as {
      ok: true;
      user: { id: string; slug: string };
    };

    // Strip any explicit admin membership on this namespace to verify pure admin-role parity.
    const db = createDb(env.DB);
    await db
      .delete(namespaceMemberships)
      .where(
        and(
          eq(namespaceMemberships.namespaceId, createdUser.user.id),
          eq(namespaceMemberships.userId, createdUser.user.id)
        )
      )
      .catch(() => {});
    // Specifically remove memberships belonging to other users (such as the admin creator)
    const memberships = await db
      .select()
      .from(namespaceMemberships)
      .where(eq(namespaceMemberships.namespaceId, createdUser.user.id));
    for (const m of memberships) {
      await db
        .delete(namespaceMemberships)
        .where(
          and(
            eq(namespaceMemberships.namespaceId, m.namespaceId),
            eq(namespaceMemberships.userId, m.userId)
          )
        );
    }

    // 1. Admin creates a repository under @cross-ns-owner without explicit membership
    const repoCreateRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({
        namespaceSlug: "cross-ns-owner",
        slug: "orphan-check",
        visibility: "public",
        initializeReadme: true,
      }),
    });
    expect(repoCreateRes.status).toBe(200);
    const repoCreated = (await repoCreateRes.json()) as {
      ok: true;
      id: string;
      defaultBranch: string;
      readmeInitialized: boolean;
    };
    expect(repoCreated.defaultBranch).toBe("main");
    expect(repoCreated.readmeInitialized).toBe(true);

    // Put a pack marker in R2 & touch DO + ROUTES KV to verify cleanup reaches R2/DO/ROUTES
    const stub = getRepoStub(env, `repo:${repoCreated.id.slice("repo_".length)}`);
    await stub.listRefs();
    const doId = env.REPO_DO.idFromName(`repo:${repoCreated.id.slice("repo_".length)}`).toString();
    await env.REPO_BUCKET.put(`${doPrefix(doId)}orphan-marker.pack`, "marker");
    await env.ROUTES.put(
      routeCacheKey("cross-ns-owner", "orphan-check"),
      JSON.stringify({
        doName: `repo:${repoCreated.id.slice("repo_".length)}`,
        visibility: "public",
      })
    );

    // 2. Admin mints a namespace-scoped PAT targeting @cross-ns-owner without explicit membership
    const patRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
      method: "POST",
      headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: "namespace",
        name: "cross-ns-ci",
        namespaceSlug: "cross-ns-owner",
        level: "push",
      }),
    });
    expect(patRes.status).toBe(200);
    const patBody = (await patRes.json()) as { id: string; plaintext: string };
    expect(patBody.plaintext.startsWith("goc_")).toBe(true);

    // 3. Admin deletes @cross-ns-owner/orphan-check -> enqueues full deletion & wipes R2/DO/ROUTES
    const repoMessages: unknown[] = [];
    const repoSendSpy = vi
      .spyOn(env.REPO_TASKS_QUEUE, "send")
      .mockImplementation(async (message: unknown) => {
        repoMessages.push(message);
        return createQueueSendResponse();
      });
    const repoDeleteRes = await SELF.fetch(`${ORIGIN}/admin/api/repositories/${repoCreated.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "cross-ns-owner/orphan-check" }),
    });
    repoSendSpy.mockRestore();
    expect(repoDeleteRes.status).toBe(202);
    const deleteMsg = repoMessages.find(
      (m) => (m as { kind?: string }).kind === "repository-delete"
    );
    expect(deleteMsg).toBeDefined();
    expect((await runQueueMessage(deleteMsg)).acked).toBe(true);
    expect(await env.ROUTES.get(routeCacheKey("cross-ns-owner", "orphan-check"))).toBeNull();
    expect((await env.REPO_BUCKET.list({ prefix: doPrefix(doId) })).objects).toHaveLength(0);

    // 4. Create a second repo and verify deleting the directory user queues repo cleanup cleanly
    const repo2Res = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({
        namespaceSlug: "cross-ns-owner",
        slug: "user-owned-repo",
        visibility: "public",
      }),
    });
    expect(repo2Res.status).toBe(200);
    const repo2 = (await repo2Res.json()) as { ok: true; id: string };
    const doName2 = `repo:${repo2.id.slice("repo_".length)}`;
    const doId2 = env.REPO_DO.idFromName(doName2).toString();
    await env.REPO_BUCKET.put(`${doPrefix(doId2)}user-pack.pack`, "user-pack");
    await env.ROUTES.put(
      routeCacheKey("cross-ns-owner", "user-owned-repo"),
      JSON.stringify({ doName: doName2, visibility: "public" })
    );

    const userOutageSpy = vi
      .spyOn(env.REPO_TASKS_QUEUE, "send")
      .mockRejectedValueOnce(new Error("queue down"));
    const deleteUserOutageRes = await SELF.fetch(
      `${ORIGIN}/admin/api/users/${createdUser.user.id}`,
      {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      }
    );
    expect(deleteUserOutageRes.status).toBe(503);
    userOutageSpy.mockRestore();

    const userMessages: unknown[] = [];
    const userSendSpy = vi
      .spyOn(env.REPO_TASKS_QUEUE, "send")
      .mockImplementation(async (message: unknown) => {
        userMessages.push(message);
        return createQueueSendResponse();
      });
    const deleteUserRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${createdUser.user.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    });
    userSendSpy.mockRestore();
    expect(deleteUserRes.status).toBe(200);
    expect(userMessages.length).toBe(1);
    expect((await runQueueMessage(userMessages[0])).acked).toBe(true);
    expect(await env.ROUTES.get(routeCacheKey("cross-ns-owner", "user-owned-repo"))).toBeNull();
    expect((await env.REPO_BUCKET.list({ prefix: doPrefix(doId2) })).objects).toHaveLength(0);

    // Clean up admin PAT minted during test
    await SELF.fetch(`${ORIGIN}/auth/api/tokens/${patBody.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, Origin: ORIGIN },
    });
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

    for (const restrictedPath of [
      "/admin",
      "/admin/repositories",
      "/admin/tokens",
      "/admin/settings",
      "/admin/security",
    ]) {
      const restrictedRes = await SELF.fetch(`${ORIGIN}${restrictedPath}`, {
        headers: { Cookie: memberCookie },
        redirect: "manual",
      });
      expect(restrictedRes.status).toBe(303);
      expect(restrictedRes.headers.get("location")).toBe("/");
    }

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

  it("allows site admins to pin/unpin any repository across namespaces and feature public repos on the main homepage", async () => {
    const adminCookie = await signInAsDemoAdmin();

    // Create a member user who creates their own public & private repositories
    const createMemberRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: "pin-owner",
        displayName: "Pin Owner",
        role: "member",
        status: "active",
        password: "PinOwner#2026",
      }),
    });
    expect(createMemberRes.status).toBe(201);
    const createdMember = (await createMemberRes.json()) as { ok: true; user: { id: string } };

    const memberLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({
        username: "pin-owner",
        password: "PinOwner#2026",
      }).toString(),
    });
    expect(memberLoginRes.status).toBe(303);
    const memberCookie = sessionCookieHeader(
      extractSessionToken(memberLoginRes.headers.get("set-cookie"))!
    );

    try {
      const publicRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
        method: "POST",
        headers: {
          Cookie: memberCookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespaceSlug: "pin-owner",
          slug: "featured-sdk",
          visibility: "public",
          description: "Flagship public SDK curated by admin",
        }),
      });
      expect(publicRepoRes.status).toBe(200);
      const publicRepo = (await publicRepoRes.json()) as { ok: true; id: string };

      const privateRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
        method: "POST",
        headers: {
          Cookie: memberCookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespaceSlug: "pin-owner",
          slug: "internal-vault",
          visibility: "private",
          description: "Private internal repo",
        }),
      });
      expect(privateRepoRes.status).toBe(200);
      const privateRepo = (await privateRepoRes.json()) as { ok: true; id: string };

      // 1. Non-admin member cannot pin to the main Public Homepage
      const memberHomePinRes = await SELF.fetch(
        `${ORIGIN}/auth/api/repositories/${publicRepo.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: memberCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ homePinned: true }),
        }
      );
      expect(memberHomePinRes.status).toBe(403);
      expect(await memberHomePinRes.json()).toEqual({ ok: false, reason: "admin-required" });

      const memberAdminApiRes = await SELF.fetch(
        `${ORIGIN}/admin/api/repositories/${publicRepo.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: memberCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ homePinned: true }),
        }
      );
      expect(memberAdminApiRes.status).toBe(403);

      // 2. Private repositories cannot be pinned to the public homepage even by admin
      const privateHomePinRes = await SELF.fetch(
        `${ORIGIN}/admin/api/repositories/${privateRepo.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: adminCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ homePinned: true }),
        }
      );
      expect(privateHomePinRes.status).toBe(400);
      expect(await privateHomePinRes.json()).toEqual({
        ok: false,
        reason: "private-repo-cannot-feature",
      });

      // 3. Site admin CAN profile-pin even a private repo across namespaces and unpin it
      const adminPrivatePinRes = await SELF.fetch(
        `${ORIGIN}/admin/api/repositories/${privateRepo.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: adminCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pinned: true }),
        }
      );
      expect(adminPrivatePinRes.status).toBe(200);
      expect(await adminPrivatePinRes.json()).toMatchObject({
        ok: true,
        pinned: true,
        homePinned: false,
      });

      // 4. Site admin pins `pin-owner/featured-sdk` both to profile and to the main Public Homepage
      const adminFeatureRes = await SELF.fetch(
        `${ORIGIN}/admin/api/repositories/${publicRepo.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: adminCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pinned: true, homePinned: true }),
        }
      );
      expect(adminFeatureRes.status).toBe(200);
      expect(await adminFeatureRes.json()).toMatchObject({
        ok: true,
        pinned: true,
        homePinned: true,
      });

      // Verify /admin/api/overview reflects both flags
      const adminOverviewRes = await SELF.fetch(`${ORIGIN}/admin/api/overview`, {
        headers: { Cookie: adminCookie },
      });
      expect(adminOverviewRes.status).toBe(200);
      const overviewJson = (await adminOverviewRes.json()) as {
        repositories: Array<{ id: string; pinned: boolean; homePinned: boolean }>;
      };
      const featuredEntry = overviewJson.repositories.find((r) => r.id === publicRepo.id);
      expect(featuredEntry).toMatchObject({ pinned: true, homePinned: true });

      // Verify anonymous public homepage (/) and /explore include the featured repo and never expose private repo
      const homeRes = await SELF.fetch(`${ORIGIN}/`);
      expect(homeRes.status).toBe(200);
      const homeHtml = await homeRes.text();
      expect(homeHtml).toContain("Pinned Repositories");
      expect(homeHtml).toContain("featured-sdk");
      expect(homeHtml).toContain("Flagship public SDK curated by admin");
      expect(homeHtml).not.toContain("internal-vault");

      const exploreRes = await SELF.fetch(`${ORIGIN}/explore`);
      expect(exploreRes.status).toBe(200);
      const exploreHtml = await exploreRes.text();
      expect(exploreHtml).toContain("Pinned Repositories");
      expect(exploreHtml).toContain("featured-sdk");
      expect(exploreHtml).not.toContain("internal-vault");

      // Verify admin visiting /pin-owner/featured-sdk sees both pin controls
      const repoPageRes = await SELF.fetch(`${ORIGIN}/pin-owner/featured-sdk`, {
        headers: { Cookie: adminCookie },
      });
      expect(repoPageRes.status).toBe(200);
      const repoPageHtml = await repoPageRes.text();
      expect(repoPageHtml).toContain("Pinned to profile · Unpin");
      expect(repoPageHtml).toContain("Pinned on homepage · Unpin");

      // 5. Admin unpins from homepage via /auth/api/repositories/:id -> no longer homepage-featured
      const adminUnfeatureRes = await SELF.fetch(
        `${ORIGIN}/auth/api/repositories/${publicRepo.id}`,
        {
          method: "PATCH",
          headers: {
            Cookie: adminCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pinned: false, homePinned: false }),
        }
      );
      expect(adminUnfeatureRes.status).toBe(200);
      expect(await adminUnfeatureRes.json()).toMatchObject({
        ok: true,
        pinned: false,
        homePinned: false,
      });

      const afterUnpinRepoPageRes = await SELF.fetch(`${ORIGIN}/pin-owner/featured-sdk`, {
        headers: { Cookie: adminCookie },
      });
      const afterUnpinRepoHtml = await afterUnpinRepoPageRes.text();
      expect(afterUnpinRepoHtml).toContain("Pin to profile");
      expect(afterUnpinRepoHtml).toContain("Pin to homepage");
    } finally {
      await SELF.fetch(`${ORIGIN}/admin/api/users/${createdMember.user.id}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
    }
  });

  it("allows active admins with a global PAT to read and push across all user namespaces and revokes access immediately on demotion", async () => {
    const adminCookie = await signInAsDemoAdmin();
    const createdPatIds: string[] = [];

    // Provision a regular member with a private repository and a secondary directory admin
    const [targetUserRes, dirAdminRes] = await Promise.all([
      SELF.fetch(`${ORIGIN}/admin/api/users`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "global-target",
          displayName: "Global Target",
          role: "member",
          status: "active",
          password: "TargetPass#2026",
        }),
      }),
      SELF.fetch(`${ORIGIN}/admin/api/users`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: "ops-admin",
          displayName: "Ops Admin",
          role: "admin",
          status: "active",
          password: "OpsAdmin#2026",
        }),
      }),
    ]);
    expect(targetUserRes.status).toBe(201);
    expect(dirAdminRes.status).toBe(201);
    const targetUser = (await targetUserRes.json()) as { user: { id: string } };
    const dirAdmin = (await dirAdminRes.json()) as { user: { id: string } };

    try {
      const targetLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "global-target",
          password: "TargetPass#2026",
        }).toString(),
      });
      expect(targetLoginRes.status).toBe(303);
      const targetCookie = sessionCookieHeader(
        extractSessionToken(targetLoginRes.headers.get("set-cookie"))!
      );

      const createRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
        method: "POST",
        headers: { Cookie: targetCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          namespaceSlug: "global-target",
          slug: "secret-app",
          visibility: "private",
          description: "Target private repo",
        }),
      });
      expect(createRepoRes.status).toBe(200);

      // Member cannot mint a global token
      const memberGlobalRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
        method: "POST",
        headers: { Cookie: targetCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", name: "nope", level: "push" }),
      });
      expect(memberGlobalRes.status).toBe(403);

      // Primary admin mints a global push token
      const adminGlobalRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", name: "root-global-push", level: "push" }),
      });
      expect(adminGlobalRes.status).toBe(200);
      const adminGlobal = (await adminGlobalRes.json()) as { id: string; plaintext: string };
      createdPatIds.push(adminGlobal.id);

      // Admin overview surfaces All namespaces target label
      const overviewRes = await SELF.fetch(`${ORIGIN}/admin/api/overview`, {
        headers: { Cookie: adminCookie },
      });
      expect(overviewRes.status).toBe(200);
      const overview = (await overviewRes.json()) as {
        primaryNamespaceSlug?: string;
        tokens: Array<{ id: string; scopeLabel: string; targetLabel: string }>;
      };
      const listedToken = overview.tokens.find((t) => t.id === adminGlobal.id);
      expect(listedToken).toMatchObject({
        scopeLabel: "read-write",
        targetLabel: "All namespaces",
      });

      const adminHandle = overview.primaryNamespaceSlug ?? "admin";
      const recvRefsUrl = `${ORIGIN}/global-target/secret-app/info/refs?service=git-receive-pack`;
      const uploadRefsUrl = `${ORIGIN}/global-target/secret-app/info/refs?service=git-upload-pack`;

      // Admin global PAT reads & pushes with admin's own handle
      const readAsAdminRes = await SELF.fetch(uploadRefsUrl, {
        headers: { Authorization: `Basic ${btoa(`${adminHandle}:${adminGlobal.plaintext}`)}` },
      });
      expect(readAsAdminRes.status).toBe(200);

      const pushAsAdminRes = await SELF.fetch(recvRefsUrl, {
        headers: { Authorization: `Basic ${btoa(`${adminHandle}:${adminGlobal.plaintext}`)}` },
      });
      expect(pushAsAdminRes.status).toBe(200);

      // Admin global PAT also works with target owner handle, and rejects unrelated username
      const pushAsTargetRes = await SELF.fetch(recvRefsUrl, {
        headers: { Authorization: `Basic ${btoa(`global-target:${adminGlobal.plaintext}`)}` },
      });
      expect(pushAsTargetRes.status).toBe(200);

      const pushAsStrangerRes = await SELF.fetch(recvRefsUrl, {
        headers: { Authorization: `Basic ${btoa(`stranger:${adminGlobal.plaintext}`)}` },
      });
      expect(pushAsStrangerRes.status).toBe(401);

      // Secondary active directory admin mints global PAT -> succeeds, then fails after demotion
      const opsLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          username: "ops-admin",
          password: "OpsAdmin#2026",
        }).toString(),
      });
      expect(opsLoginRes.status).toBe(303);
      const opsCookie = sessionCookieHeader(
        extractSessionToken(opsLoginRes.headers.get("set-cookie"))!
      );

      const opsGlobalRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
        method: "POST",
        headers: { Cookie: opsCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", name: "ops-global-push", level: "push" }),
      });
      expect(opsGlobalRes.status).toBe(200);
      const opsGlobal = (await opsGlobalRes.json()) as { id: string; plaintext: string };

      const opsPushAllowedRes = await SELF.fetch(recvRefsUrl, {
        headers: { Authorization: `Basic ${btoa(`ops-admin:${opsGlobal.plaintext}`)}` },
      });
      expect(opsPushAllowedRes.status).toBe(200);

      // Demote ops-admin -> member; global PAT immediately fails closed (403)
      const demoteRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${dirAdmin.user.id}`, {
        method: "PATCH",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "member" }),
      });
      expect(demoteRes.status).toBe(200);

      const opsPushAfterDemoteRes = await SELF.fetch(recvRefsUrl, {
        headers: { Authorization: `Basic ${btoa(`ops-admin:${opsGlobal.plaintext}`)}` },
      });
      expect(opsPushAfterDemoteRes.status).toBe(403);
    } finally {
      for (const patId of createdPatIds) {
        await SELF.fetch(`${ORIGIN}/auth/api/tokens/${patId}`, {
          method: "DELETE",
          headers: { Cookie: adminCookie, Origin: ORIGIN },
        });
      }
      await SELF.fetch(`${ORIGIN}/admin/api/users/${targetUser.user.id}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
      await SELF.fetch(`${ORIGIN}/admin/api/users/${dirAdmin.user.id}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
    }
  });

  it("supports admin multi-user PAT visibility/revocation, editable branding API, auth rate limits, atomic profile updates, and JSON/blob route parity", async () => {
    const adminCookie = await signInAsDemoAdmin();
    const createdPatIds: string[] = [];

    // Provision a member user with password so we can test PAT ownership, profile race safety, and rate limits
    const memberCreateRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
      method: "POST",
      headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: "audit-member",
        displayName: "Audit Member",
        role: "member",
        status: "active",
        password: "AuditMember#2026",
      }),
    });
    expect(memberCreateRes.status).toBe(201);
    const member = (await memberCreateRes.json()) as { user: { id: string } };

    try {
      // 1. UI copy & route checks (/admin/security & footer Explore label)
      const [securityPageRes, publicHomeBeforeRes] = await Promise.all([
        SELF.fetch(`${ORIGIN}/admin/security`, { headers: { Cookie: adminCookie } }),
        SELF.fetch(`${ORIGIN}/`),
      ]);
      expect(securityPageRes.status).toBe(200);
      const securityHtml = await securityPageRes.text();
      expect(securityHtml).toContain("AES-256-GCM encrypted");
      expect(securityHtml).not.toContain("HMAC-signed");

      const publicBeforeHtml = await publicHomeBeforeRes.text();
      expect(publicBeforeHtml).toContain(">Explore</a>");
      expect(publicBeforeHtml).not.toContain(">Status</a>");

      // 2. Member mints a PAT -> visible in admin overview with ownerSlug and revocable via /admin/api/tokens/:patId
      const memberLoginRes = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "198.51.100.20",
        },
        body: new URLSearchParams({
          username: "audit-member",
          password: "AuditMember#2026",
        }).toString(),
      });
      expect(memberLoginRes.status).toBe(303);
      const memberCookie = sessionCookieHeader(
        extractSessionToken(memberLoginRes.headers.get("set-cookie"))!
      );

      const memberPatRes = await SELF.fetch(`${ORIGIN}/auth/api/tokens`, {
        method: "POST",
        headers: { Cookie: memberCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "namespace",
          name: "member-ci",
          namespaceSlug: "audit-member",
          level: "pull",
        }),
      });
      expect(memberPatRes.status).toBe(200);
      const memberPat = (await memberPatRes.json()) as { id: string };
      createdPatIds.push(memberPat.id);

      const overviewRes = await SELF.fetch(`${ORIGIN}/admin/api/overview`, {
        headers: { Cookie: adminCookie },
      });
      expect(overviewRes.status).toBe(200);
      const overview = (await overviewRes.json()) as {
        tokens: Array<{ id: string; ownerSlug?: string; revokedAt?: number }>;
      };
      const auditedToken = overview.tokens.find((t) => t.id === memberPat.id);
      expect(auditedToken?.ownerSlug).toBe("audit-member");
      expect(auditedToken?.revokedAt).toBeUndefined();

      // Non-admin cannot call /admin/api/tokens/:patId
      const forbiddenRevokeRes = await SELF.fetch(`${ORIGIN}/admin/api/tokens/${memberPat.id}`, {
        method: "DELETE",
        headers: { Cookie: memberCookie, Origin: ORIGIN },
      });
      expect(forbiddenRevokeRes.status).toBe(403);

      // Admin revokes member token cleanly
      const adminRevokeRes = await SELF.fetch(`${ORIGIN}/admin/api/tokens/${memberPat.id}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
      expect(adminRevokeRes.status).toBe(200);

      // 3. Atomic profile update preserves concurrent admin role changes (BUG-22)
      const adminPromoteRes = await SELF.fetch(`${ORIGIN}/admin/api/users/${member.user.id}`, {
        method: "PATCH",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      });
      expect(adminPromoteRes.status).toBe(200);

      const memberProfileUpdateRes = await SELF.fetch(`${ORIGIN}/auth/api/profile`, {
        method: "PUT",
        headers: { Cookie: memberCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated Member Name" }),
      });
      expect(memberProfileUpdateRes.status).toBe(200);

      const usersAfterRes = await SELF.fetch(`${ORIGIN}/admin/api/users`, {
        headers: { Cookie: adminCookie },
      });
      const usersAfter = (await usersAfterRes.json()) as {
        users: Array<{ id: string; role: string; displayName: string }>;
      };
      const reloadedMember = usersAfter.users.find((u) => u.id === member.user.id);
      expect(reloadedMember?.displayName).toBe("Updated Member Name");
      expect(reloadedMember?.role).toBe("admin");

      // 4. Configurable branding PUT /admin/api/settings persists to KV and updates rendered HTML
      const updateSettingsRes = await SELF.fetch(`${ORIGIN}/admin/api/settings`, {
        method: "PUT",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          shortName: "Orbit Git",
          heroTitle: "Orbit Engineering Repositories",
          footerText: "© 2026 Orbit Labs",
        }),
      });
      expect(updateSettingsRes.status).toBe(200);

      const homeUpdatedRes = await SELF.fetch(`${ORIGIN}/`);
      const homeUpdatedHtml = await homeUpdatedRes.text();
      expect(homeUpdatedHtml).toContain("Orbit Git");
      expect(homeUpdatedHtml).toContain("Orbit Engineering Repositories");
      expect(homeUpdatedHtml).toContain("© 2026 Orbit Labs");
      expect(homeUpdatedHtml).toContain("git-on-cloudflare");

      // Reset branding defaults cleanly
      await SELF.fetch(`${ORIGIN}/admin/api/settings`, {
        method: "PUT",
        headers: { Cookie: adminCookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          shortName: "Vib Git",
          heroTitle: "Vib Tools Open-Source Repositories",
          footerText: "© 2026 Vib Tools · Open-Source Git Forge",
        }),
      });

      // 5. Commit fragments / diff JSON error contract (ERR-09)
      const [badFragmentRes, badDiffRes] = await Promise.all([
        SELF.fetch(`${ORIGIN}/admin/edge-starter/commits/fragments/not-a-valid-oid`),
        SELF.fetch(`${ORIGIN}/admin/edge-starter/commit/not-a-valid-oid/diff`),
      ]);
      expect(badFragmentRes.status).toBe(400);
      expect(badFragmentRes.headers.get("content-type")).toContain("application/json");
      expect(await badFragmentRes.json()).toMatchObject({ error: "OID must be 40 hex" });

      expect(badDiffRes.status).toBe(400);
      expect(badDiffRes.headers.get("content-type")).toContain("application/json");
      expect(await badDiffRes.json()).toMatchObject({ error: "Commit id must be 40-hex" });

      // 6. KV rate limiting on login & change-password (BUG-16) using isolated client IP
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const failLogin = await SELF.fetch(`${ORIGIN}/auth/login`, {
          method: "POST",
          redirect: "manual",
          headers: {
            Origin: ORIGIN,
            "Content-Type": "application/x-www-form-urlencoded",
            "CF-Connecting-IP": "198.51.100.99",
          },
          body: new URLSearchParams({
            username: "audit-member",
            password: "WrongPassword#0",
          }).toString(),
        });
        expect(failLogin.status).toBe(303);
      }
      const blockedLogin = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: {
          Origin: ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "198.51.100.99",
        },
        body: new URLSearchParams({
          username: "audit-member",
          password: "AuditMember#2026",
        }).toString(),
      });
      expect(blockedLogin.status).toBe(303);
      expect(blockedLogin.headers.get("location")).toContain("error=rate_limited");
      expect(Number(blockedLogin.headers.get("retry-after"))).toBeGreaterThan(0);

      const blockedLoginJson = await SELF.fetch(`${ORIGIN}/auth/login`, {
        method: "POST",
        headers: {
          Origin: ORIGIN,
          Accept: "application/json",
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.99",
        },
        body: JSON.stringify({
          username: "audit-member",
          password: "AuditMember#2026",
        }),
      });
      expect(blockedLoginJson.status).toBe(429);
      expect(Number(blockedLoginJson.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(await blockedLoginJson.json()).toMatchObject({
        error: "Too many failed sign-in attempts",
      });

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const failPw = await SELF.fetch(`${ORIGIN}/auth/api/change-password`, {
          method: "POST",
          headers: {
            Cookie: memberCookie,
            Origin: ORIGIN,
            "Content-Type": "application/json",
            "CF-Connecting-IP": "198.51.100.100",
          },
          body: JSON.stringify({
            currentPassword: "WrongCurrent#0",
            newPassword: "NewStrongPass#2026",
          }),
        });
        expect(failPw.status).toBe(400);
      }
      const blockedPw = await SELF.fetch(`${ORIGIN}/auth/api/change-password`, {
        method: "POST",
        headers: {
          Cookie: memberCookie,
          Origin: ORIGIN,
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.100",
        },
        body: JSON.stringify({
          currentPassword: "AuditMember#2026",
          newPassword: "NewStrongPass#2026",
        }),
      });
      expect(blockedPw.status).toBe(429);
      expect(await blockedPw.json()).toMatchObject({ ok: false, reason: "rate-limited" });
    } finally {
      for (const patId of createdPatIds) {
        await SELF.fetch(`${ORIGIN}/admin/api/tokens/${patId}`, {
          method: "DELETE",
          headers: { Cookie: adminCookie, Origin: ORIGIN },
        });
      }
      await SELF.fetch(`${ORIGIN}/admin/api/users/${member.user.id}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, Origin: ORIGIN },
      });
    }
  });
});
