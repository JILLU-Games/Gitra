import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { ensureD1Migrations } from "./util/d1Setup";

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

describe("Phase 03 real metadata, web Git delete/move/upload/refs, and rawpath hotlink", () => {
  beforeAll(async () => {
    await ensureD1Migrations(env);
  });

  it("supports F-11 real metadata derivation, F-12 web binary/move/delete/refs/commitEmail, and F-16 rawpath headers", async () => {
    const adminCookie = await signInAsDemoAdmin();
    const writer = await createAndSignInUser(adminCookie, {
      handle: "phase3-writer",
      displayName: "Phase3 Writer",
      role: "member",
      password: "WriterPassword#2026",
    });
    const viewer = await createAndSignInUser(adminCookie, {
      handle: "phase3-viewer",
      displayName: "Phase3 Viewer",
      role: "viewer",
      password: "ViewerPassword#2026",
    });

    // Configure writer commitEmail on profile and verify invalid email is rejected
    const badProfileRes = await SELF.fetch(`${ORIGIN}/auth/api/profile`, {
      method: "PUT",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        commitEmail: "not-a-valid-email",
      }),
    });
    expect(badProfileRes.status).toBe(400);

    const goodProfileRes = await SELF.fetch(`${ORIGIN}/auth/api/profile`, {
      method: "PUT",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: "Phase3 Writer",
        commitEmail: "writer-custom@gitra.example",
      }),
    });
    expect(goodProfileRes.status).toBe(200);
    const savedProfile = (await goodProfileRes.json()) as { ok: true; commitEmail?: string };
    expect(savedProfile.commitEmail).toBe("writer-custom@gitra.example");

    // /user/profile SSR shows the configured commit email input
    const profilePageRes = await SELF.fetch(`${ORIGIN}/user/profile`, {
      headers: { Cookie: writer.cookie },
    });
    expect(profilePageRes.status).toBe(200);
    const profilePageHtml = await profilePageRes.text();
    expect(profilePageHtml).toContain("writer-custom@gitra.example");

    // Create a Rust repo + an empty repo under phase3-writer
    const createRustRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        namespaceSlug: "phase3-writer",
        slug: "rust-service",
        visibility: "public",
        initializeReadme: true,
      }),
    });
    expect(createRustRepoRes.status).toBe(200);
    const rustRepo = (await createRustRepoRes.json()) as { ok: true; id: string };

    const createEmptyRepoRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories`, {
      method: "POST",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        namespaceSlug: "phase3-writer",
        slug: "empty-notes",
        visibility: "public",
        initializeReadme: false,
      }),
    });
    expect(createEmptyRepoRes.status).toBe(200);

    // Commit a Rust file and MIT LICENSE via web editor; check author header uses custom email
    const rustFileRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${rustRepo.id}/file`, {
      method: "PUT",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "src/main.rs",
        content: 'fn main() { println!("ok"); }\n',
        message: "Add Rust entrypoint",
        ref: "main",
      }),
    });
    expect(rustFileRes.status).toBe(200);
    const rustCommit = (await rustFileRes.json()) as { commitOid: string };

    const commitPageRes = await SELF.fetch(
      `${ORIGIN}/phase3-writer/rust-service/commit/${rustCommit.commitOid}`
    );
    expect(commitPageRes.status).toBe(200);
    const commitPageHtml = await commitPageRes.text();
    expect(commitPageHtml).toContain("writer-custom@gitra.example");
    expect(commitPageHtml).not.toContain("@local.dev");

    const licenseRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${rustRepo.id}/file`, {
      method: "PUT",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "LICENSE",
        content: "MIT License\n\nPermission is hereby granted, free of charge\n",
        message: "Add MIT license",
        ref: "main",
      }),
    });
    expect(licenseRes.status).toBe(200);

    // F-11: Public homepage shows real derived Rust language + MIT license + empty-notes, no dummy Python option, no Vib Tools fallback
    const anonHomeRes = await SELF.fetch(`${ORIGIN}/`);
    expect(anonHomeRes.status).toBe(200);
    const anonHomeHtml = await anonHomeRes.text();
    expect(anonHomeHtml).toContain("Rust");
    expect(anonHomeHtml).toContain("MIT");
    expect(anonHomeHtml).toContain("empty-notes");
    expect(anonHomeHtml).not.toContain('<option value="Python">Python</option>');
    expect(anonHomeHtml).not.toContain("Official open-source repository published by Vib Tools.");

    // F-12: Binary file upload via multipart/form-data
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
    ]);
    const form = new FormData();
    form.set("path", "assets/logo.png");
    form.set("message", "Upload binary logo");
    form.set("ref", "main");
    form.set("file", new File([pngBytes], "logo.png", { type: "image/png" }));

    const uploadRes = await SELF.fetch(
      `${ORIGIN}/auth/api/repositories/${rustRepo.id}/file/upload`,
      {
        method: "POST",
        headers: {
          Cookie: writer.cookie,
          Origin: ORIGIN,
        },
        body: form,
      }
    );
    expect(uploadRes.status).toBe(200);
    const uploadJson = (await uploadRes.json()) as {
      ok: true;
      path: string;
      bytes: number;
    };
    expect(uploadJson.path).toBe("assets/logo.png");
    expect(uploadJson.bytes).toBe(pngBytes.byteLength);

    // Blob page for binary PNG file exposes Rename / Move and Delete file for writer, hidden from anon
    const writerBinaryBlobRes = await SELF.fetch(
      `${ORIGIN}/phase3-writer/rust-service/blob?ref=main&path=assets%2Flogo.png`,
      { headers: { Cookie: writer.cookie } }
    );
    expect(writerBinaryBlobRes.status).toBe(200);
    const writerBinaryHtml = await writerBinaryBlobRes.text();
    expect(writerBinaryHtml).toContain("/phase3-writer/rust-service/rawpath?");
    expect(writerBinaryHtml).toContain("Rename / Move");
    expect(writerBinaryHtml).toContain("Delete file");

    // Subdirectory /tree page enables adding files inside current folder
    const subdirTreeRes = await SELF.fetch(
      `${ORIGIN}/phase3-writer/rust-service/tree?ref=main&path=assets`,
      { headers: { Cookie: writer.cookie } }
    );
    expect(subdirTreeRes.status).toBe(200);
    const subdirTreeHtml = await subdirTreeRes.text();
    expect(subdirTreeHtml).toContain("Add file");
    expect(subdirTreeHtml).toContain("Upload file");

    // F-16: /rawpath allows Sec-Fetch-Site: none, same-origin, and X-Forwarded-Host proxy Referer; blocks cross-site/bare
    const rawUrl = `${ORIGIN}/phase3-writer/rust-service/rawpath?ref=main&path=assets%2Flogo.png`;
    const newTabRaw = await SELF.fetch(rawUrl, {
      headers: { "Sec-Fetch-Site": "none" },
    });
    expect(newTabRaw.status).toBe(200);
    expect(new Uint8Array(await newTabRaw.arrayBuffer())).toEqual(pngBytes);

    const sameOriginRaw = await SELF.fetch(rawUrl, {
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(sameOriginRaw.status).toBe(200);

    const forwardedRaw = await SELF.fetch(rawUrl, {
      headers: {
        "X-Forwarded-Host": "custom.forge.internal",
        Referer: "https://custom.forge.internal/phase3-writer/rust-service",
      },
    });
    expect(forwardedRaw.status).toBe(200);

    const crossSiteRaw = await SELF.fetch(rawUrl, {
      headers: {
        "Sec-Fetch-Site": "cross-site",
        Referer: `${ORIGIN}/phase3-writer/rust-service`,
      },
    });
    expect(crossSiteRaw.status).toBe(403);

    const bareRaw = await SELF.fetch(rawUrl);
    expect(bareRaw.status).toBe(403);

    // F-12: Rename / Move file across directories (prunes empty `assets/`)
    const moveRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${rustRepo.id}/file/move`, {
      method: "POST",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromPath: "assets/logo.png",
        toPath: "static/brand.png",
        message: "Move logo to static/",
        ref: "main",
      }),
    });
    expect(moveRes.status).toBe(200);

    const movedTreeRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/tree?ref=main`);
    const movedTreeHtml = await movedTreeRes.text();
    expect(movedTreeHtml).toContain("static");
    expect(movedTreeHtml).not.toContain("assets");

    // F-12: Delete file
    const deleteRes = await SELF.fetch(`${ORIGIN}/auth/api/repositories/${rustRepo.id}/file`, {
      method: "DELETE",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "static/brand.png",
        message: "Remove static/brand.png",
        ref: "main",
      }),
    });
    expect(deleteRes.status).toBe(200);

    const deletedBlobRes = await SELF.fetch(
      `${ORIGIN}/phase3-writer/rust-service/blob?ref=main&path=static%2Fbrand.png`
    );
    expect(deletedBlobRes.status).toBe(404);

    // F-12: Branch/Tag management endpoints (+ viewer/anon permission enforcement)
    const viewerBranchRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/admin/refs`, {
      method: "POST",
      headers: {
        Cookie: viewer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "branch", name: "release/v1", sourceRef: "main" }),
    });
    expect(viewerBranchRes.status).toBe(403);

    const createBranchRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/admin/refs`, {
      method: "POST",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "branch", name: "release/v1", sourceRef: "main" }),
    });
    expect(createBranchRes.status).toBe(201);

    const dupBranchRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/admin/refs`, {
      method: "POST",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "branch", name: "release/v1", sourceRef: "main" }),
    });
    expect(dupBranchRes.status).toBe(409);

    const createTagRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/admin/refs`, {
      method: "POST",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "tag", name: "v1.0.0", sourceRef: "release/v1" }),
    });
    expect(createTagRes.status).toBe(201);

    // Cannot delete active default branch `refs/heads/main`
    const deleteDefaultRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/admin/refs`, {
      method: "DELETE",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "refs/heads/main" }),
    });
    expect(deleteDefaultRes.status).toBe(409);

    // Delete tag succeeds, and overview mounts branch/tag UI for writer
    const deleteTagRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service/admin/refs`, {
      method: "DELETE",
      headers: {
        Cookie: writer.cookie,
        Origin: ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "refs/tags/v1.0.0" }),
    });
    expect(deleteTagRes.status).toBe(200);

    const overviewRes = await SELF.fetch(`${ORIGIN}/phase3-writer/rust-service`, {
      headers: { Cookie: writer.cookie },
    });
    expect(overviewRes.status).toBe(200);
    const overviewHtml = await overviewRes.text();
    expect(overviewHtml).toContain("New ref");
    expect(overviewHtml).toContain("release/v1");
  });
});
