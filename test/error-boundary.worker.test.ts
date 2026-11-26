import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { encodeGitObject } from "@/worker/git/core";

import { ensureD1Migrations } from "./util/d1Setup";
import { extractSessionToken, sessionCookieHeader } from "./util/authCookies";
import { buildPack } from "./util/git-pack";
import { buildTreePayload, seedPackedRepoState } from "./util/packed-repo";
import { setupRepoForTests } from "./util/repoSeed";

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

  it("blocks SVG XSS on rawpath and sanitizes Content-Disposition filenames on raw/rawpath", async () => {
    const owner = `xss-${Math.random().toString(36).slice(2, 8)}`;
    const repo = "svg-test";
    await setupRepoForTests(env, owner, repo, { visibility: "public" });
    const repoId = `${owner}/${repo}`;
    const getStub = () => env.REPO_DO.get(env.REPO_DO.idFromName(repoId));

    const svgBytes = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    const binarySvgBytes = new Uint8Array([0x00, ...svgBytes]);
    const svgBlob = await encodeGitObject("blob", svgBytes);
    const binarySvgBlob = await encodeGitObject("blob", binarySvgBytes);
    const treePayload = buildTreePayload([
      { mode: "100644", name: "binary.svg", oid: binarySvgBlob.oid },
      { mode: "100644", name: "xss.svg", oid: svgBlob.oid },
    ]);
    const treeObj = await encodeGitObject("tree", treePayload);
    const author = "Sec Test <sec@example.com> 0 +0000";
    const commitPayload = new TextEncoder().encode(
      `tree ${treeObj.oid}\nauthor ${author}\ncommitter ${author}\n\nadd svg\n`
    );
    const commitObj = await encodeGitObject("commit", commitPayload);
    const packBytes = await buildPack([
      { type: "blob", payload: binarySvgBytes },
      { type: "blob", payload: svgBytes },
      { type: "tree", payload: treePayload },
      { type: "commit", payload: commitPayload },
    ]);
    await seedPackedRepoState({
      env,
      repoId,
      getStub,
      packs: [{ name: "pack-svg-xss.pack", packBytes }],
      refs: [{ name: "refs/heads/main", oid: commitObj.oid }],
      head: { target: "refs/heads/main", oid: commitObj.oid },
      looseObjects: [binarySvgBlob, svgBlob, treeObj, commitObj],
      mirrorLooseToR2: true,
    });

    // Binary-flagged SVG is no longer embedded inline via <img> on /blob.
    const binaryBlobPage = await SELF.fetch(
      `${ORIGIN}/${owner}/${repo}/blob?ref=main&path=binary.svg`
    );
    expect(binaryBlobPage.status).toBe(200);
    const binaryHtml = await binaryBlobPage.text();
    expect(binaryHtml).toContain("Binary file.");
    expect(binaryHtml).not.toContain("/rawpath?");

    // Direct rawpath request to .svg forces text/plain + sandbox CSP + nosniff + attachment.
    const svgRawPath = await SELF.fetch(
      `${ORIGIN}/${owner}/${repo}/rawpath?ref=main&path=xss.svg`,
      { headers: { Referer: `${ORIGIN}/${owner}/${repo}` } }
    );
    expect(svgRawPath.status).toBe(200);
    expect(svgRawPath.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(svgRawPath.headers.get("content-security-policy")).toBe("sandbox");
    expect(svgRawPath.headers.get("x-content-type-options")).toBe("nosniff");
    expect(svgRawPath.headers.get("content-disposition")).toBe('attachment; filename="xss.svg"');

    // Spoofed ?name=photo.png on xss.svg still forces text/plain + attachment.
    const spoofedNameRes = await SELF.fetch(
      `${ORIGIN}/${owner}/${repo}/rawpath?ref=main&path=xss.svg&name=photo.png`,
      { headers: { Referer: `${ORIGIN}/${owner}/${repo}` } }
    );
    expect(spoofedNameRes.status).toBe(200);
    expect(spoofedNameRes.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(spoofedNameRes.headers.get("content-disposition")).toBe(
      'attachment; filename="photo.png"'
    );

    // Header injection / path traversal in ?name=... is sanitized on /rawpath and /raw.
    const injectedRawPath = await SELF.fetch(
      `${ORIGIN}/${owner}/${repo}/rawpath?ref=main&path=xss.svg&name=${encodeURIComponent(
        '../../evil";x=1\r\nInjected: yes.svg'
      )}`,
      { headers: { Referer: `${ORIGIN}/${owner}/${repo}` } }
    );
    expect(injectedRawPath.status).toBe(200);
    const rawPathDisp = injectedRawPath.headers.get("content-disposition") ?? "";
    expect(rawPathDisp).not.toContain("\r");
    expect(rawPathDisp).not.toContain("\n");
    expect(rawPathDisp).toBe('attachment; filename="evil__x=1__Injected: yes.svg"');

    const injectedRaw = await SELF.fetch(
      `${ORIGIN}/${owner}/${repo}/raw?oid=${svgBlob.oid}&download=1&name=${encodeURIComponent(
        'bad";\r\nEvil: 1.txt'
      )}`
    );
    expect(injectedRaw.status).toBe(200);
    expect(injectedRaw.headers.get("content-security-policy")).toBe("sandbox");
    expect(injectedRaw.headers.get("x-content-type-options")).toBe("nosniff");
    expect(injectedRaw.headers.get("content-disposition")).toBe(
      'attachment; filename="bad____Evil: 1.txt"'
    );
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
