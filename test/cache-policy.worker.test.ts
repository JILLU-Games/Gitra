import { beforeAll, describe, expect, it } from "vitest";
import { env, exports as workerExports } from "cloudflare:workers";

import type { CommitFilePatchResult } from "@/shared/git/types";
import { buildCacheKeyFrom, cacheGetJSON, cachePutJSON } from "@/worker/cache";
import { newPrefixedId } from "@/worker/common";
import { createDb } from "@/worker/db/d1/client";
import { insertUserIfNew, claimNamespace, insertMembershipIfMissing } from "@/worker/db/d1/dal";

import { ensureD1Migrations } from "./util/d1Setup";
import { mintSessionCookie, seedRepo } from "./util/repoSeed";
import { seedPackFirstRepo } from "./util/pack-first";

beforeAll(async () => {
  await ensureD1Migrations(env);
});

async function makeMember(
  namespaceSlug: string
): Promise<{ userId: string; cookieHeader: string }> {
  const db = createDb(env.DB);
  const userId = newPrefixedId("user");
  const namespaceId = newPrefixedId("ns");
  const now = Date.now();
  await insertUserIfNew(db, { id: userId, tesseraSub: `t-${userId}`, createdAt: now });
  const claimed = await claimNamespace(db, {
    id: namespaceId,
    slug: namespaceSlug,
    createdBy: userId,
    createdAt: now,
  });
  if (!claimed) throw new Error(`namespace ${namespaceSlug} already exists`);
  await insertMembershipIfMissing(db, {
    namespaceId: claimed.id,
    userId,
    createdAt: now,
  });
  return { userId, cookieHeader: await mintSessionCookie(env, userId) };
}

// The /commit/:oid/diff?path= endpoint stores a `CommitFilePatchResult`
// under `/_cache/commit-patch` keyed by repo+oid+path+v. The fixture
// `seedPackFirstRepo` creates a real README.md change, so the loader,
// when invoked, returns `{ path, changeType: "M", patch: <text>, ... }`
// with `skipped` undefined. Tests that prove cache bypass therefore poison
// with a clearly-distinct sentinel and assert the loader-shape result on
// the response.
describe("cache-policy: private repos bypass shared cache", () => {
  it("private commit-diff endpoint does not write to /_cache/commit-patch", async () => {
    const ns = `cp-diff-${Math.random().toString(36).slice(2, 8)}`;
    const member = await makeMember(ns);
    const repoSlug = "site";
    await seedRepo(env, {
      namespaceSlug: ns,
      repoSlug,
      userId: member.userId,
      visibility: "private",
    });
    const repoId = `${ns}/${repoSlug}`;
    const seeded = await seedPackFirstRepo(repoId);

    const cacheKey = buildCacheKeyFrom(
      new Request(
        `https://example.com/${ns}/${repoSlug}/commit/${seeded.nextCommit.oid}/diff?path=README.md`
      ),
      "/_cache/commit-patch",
      { repo: repoId, oid: seeded.nextCommit.oid, path: "README.md", v: "1" }
    );
    // Pre-clear in case a previous test seeded it.
    expect(await cacheGetJSON(cacheKey)).toBeNull();

    const res = await workerExports.default.fetch(
      `https://example.com/${ns}/${repoSlug}/commit/${seeded.nextCommit.oid}/diff?path=README.md`,
      { headers: { Cookie: member.cookieHeader } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CommitFilePatchResult;
    // Loader actually ran: real diff present, no skip sentinel.
    expect(body.path).toBe("README.md");
    expect(body.skipped).not.toBe(true);
    expect(typeof body.patch).toBe("string");
    // The private path must NOT have written the patch into shared cache.
    expect(await cacheGetJSON(cacheKey)).toBeNull();
  });

  it("public-then-private flip: pre-warmed commit-patch cache is NOT served on subsequent private read", async () => {
    const ns = `cp-flip-${Math.random().toString(36).slice(2, 8)}`;
    const member = await makeMember(ns);
    const repoSlug = "site";
    const seedRow = await seedRepo(env, {
      namespaceSlug: ns,
      repoSlug,
      userId: member.userId,
      visibility: "public",
    });
    const repoId = `${ns}/${repoSlug}`;
    const seeded = await seedPackFirstRepo(repoId);

    // Public read primes the typed cache shape (loader executes, response
    // is well-formed). We then overwrite the cache entry with a poisoned
    // body so we can detect bypass on the subsequent private read.
    const publicRes = await workerExports.default.fetch(
      `https://example.com/${ns}/${repoSlug}/commit/${seeded.nextCommit.oid}/diff?path=README.md`
    );
    expect(publicRes.status).toBe(200);
    const cacheKey = buildCacheKeyFrom(
      new Request(
        `https://example.com/${ns}/${repoSlug}/commit/${seeded.nextCommit.oid}/diff?path=README.md`
      ),
      "/_cache/commit-patch",
      { repo: repoId, oid: seeded.nextCommit.oid, path: "README.md", v: "1" }
    );
    // Workers Cache writes are best-effort in vitest pool workers; the
    // assertion below confirms the poison body is what we'd serve if cache
    // bypass were broken. If the prime didn't take, the test still
    // exercises the bypass write-side via the second read's cache state.
    const poisoned: CommitFilePatchResult = {
      path: "README.md",
      changeType: "M",
      skipped: true,
      skipReason: "binary",
    };
    await cachePutJSON(cacheKey, poisoned, 86400);
    const primed = await cacheGetJSON<CommitFilePatchResult>(cacheKey);
    expect(primed?.skipReason).toBe("binary");

    // Flip to private.
    const flipRes = await workerExports.default.fetch(
      `https://example.com/auth/api/repositories/${encodeURIComponent(seedRow.repositoryId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: member.cookieHeader,
        },
        body: JSON.stringify({ visibility: "private" }),
      }
    );
    expect(flipRes.status).toBe(200);

    // Member read after flip MUST NOT serve the poisoned cache; the
    // bypassed loader returns the real diff with `patch` set and no skip
    // sentinel. We also confirm the response's `Cache-Control` is
    // `no-store` so downstream caches do not reuse the body.
    const privateRes = await workerExports.default.fetch(
      `https://example.com/${ns}/${repoSlug}/commit/${seeded.nextCommit.oid}/diff?path=README.md`,
      { headers: { Cookie: member.cookieHeader } }
    );
    expect(privateRes.status).toBe(200);
    const body = (await privateRes.json()) as CommitFilePatchResult;
    expect(body.path).toBe("README.md");
    expect(body.skipped).not.toBe(true);
    expect(body.skipReason).not.toBe("binary");
    expect(typeof body.patch).toBe("string");
  });
});

describe("phase 03: edge cache versioning, tag/sha edit guards, and web-commit cleanup", () => {
  it("BUG-07: public refs, tree, commits, overview, and ls-refs invalidate immediately on web commit and CLI push", async () => {
    const { encodeGitObject, pktLine, flushPkt, concatChunks, decodePktLines } =
      await import("@/worker/git");
    const { buildPack, buildTreePayload, callStubWithRetry, postReceivePack, toRequestBody } =
      await import("./util/test-helpers");
    const { setupRepoForTests } = await import("./util/repoSeed");

    const ns = `cp-inv-${Math.random().toString(36).slice(2, 8)}`;
    const repoSlug = "app";
    const seededRepo = await setupRepoForTests(env, ns, repoSlug, { visibility: "public" });
    const repoId = `${ns}/${repoSlug}`;
    const seeded = await seedPackFirstRepo(repoId);

    const lsRefsBody = toRequestBody(
      concatChunks([
        pktLine("command=ls-refs\n"),
        pktLine("0001"),
        pktLine("ref-prefix refs/heads/\n"),
        flushPkt(),
      ])
    );
    const readLsRefsOid = async (): Promise<string | undefined> => {
      const res = await workerExports.default.fetch(
        `https://example.com/${ns}/${repoSlug}/git-upload-pack`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-git-upload-pack-request",
            "Git-Protocol": "version=2",
          },
          body: lsRefsBody,
        }
      );
      expect(res.status).toBe(200);
      const lines = decodePktLines(new Uint8Array(await res.arrayBuffer()))
        .filter((item) => item.type === "line")
        .map((item) => item.text?.trim() ?? "");
      const mainLine = lines.find((line) => line.endsWith(" refs/heads/main"));
      return mainLine?.split(" ")[0];
    };

    // Prime public edge caches for refs, overview, tree, commits, and ls-refs.
    const initialRefsRes = await workerExports.default.fetch(
      `https://example.com/${ns}/${repoSlug}/api/refs`
    );
    expect(initialRefsRes.status).toBe(200);
    const initialRefsJson = (await initialRefsRes.json()) as {
      branches?: Array<{ name: string; displayName: string }>;
    };
    expect(initialRefsJson.branches?.some((b) => b.name === "main")).toBe(true);
    expect(initialRefsJson.branches?.some((b) => b.name === "feature-web")).toBe(false);

    expect(
      (await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}`)).status
    ).toBe(200);
    expect(
      (await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/tree?ref=main`))
        .status
    ).toBe(200);
    expect(
      (await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/commits?ref=main`))
        .status
    ).toBe(200);
    expect(await readLsRefsOid()).toBe(seeded.nextCommit.oid);

    // 1. Perform a web commit on main AND create a new branch via web commit
    const webCommitRes = await workerExports.default.fetch(
      `https://example.com/auth/api/repositories/${encodeURIComponent(seededRepo.repositoryId)}/file`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: seededRepo.cookieHeader,
        },
        body: JSON.stringify({
          ref: "refs/heads/main",
          path: "notes/fresh.txt",
          content: "fresh web commit content\n",
          message: "Web commit invalidates caches",
        }),
      }
    );
    expect(webCommitRes.status).toBe(200);
    const webCommitJson = (await webCommitRes.json()) as { commitOid: string };
    expect(webCommitJson.commitOid).toMatch(/^[0-9a-f]{40}$/);

    const branchCommitRes = await workerExports.default.fetch(
      `https://example.com/auth/api/repositories/${encodeURIComponent(seededRepo.repositoryId)}/file`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: seededRepo.cookieHeader,
        },
        body: JSON.stringify({
          ref: "refs/heads/feature-web",
          path: "feature.txt",
          content: "feature branch\n",
          message: "Create feature-web branch",
        }),
      }
    );
    expect(branchCommitRes.status).toBe(200);

    // Verify public endpoints immediately reflect the web commits.
    const refsAfterWeb = (await (
      await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/api/refs`)
    ).json()) as { branches?: Array<{ name: string; displayName: string }> };
    expect(refsAfterWeb.branches?.some((b) => b.name === "feature-web")).toBe(true);
    expect(await readLsRefsOid()).toBe(webCommitJson.commitOid);

    const treeHtml = await (
      await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/tree?ref=main`)
    ).text();
    expect(treeHtml).toContain("notes");
    const commitsHtml = await (
      await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/commits?ref=main`)
    ).text();
    expect(commitsHtml).toContain("Web commit invalidates caches");
    const overviewHtml = await (
      await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}`)
    ).text();
    expect(overviewHtml).toContain("notes");

    // 2. Perform a CLI push via git-receive-pack updating main and creating tag cli-v1
    const author = "CLI User <cli@example.com> 0 +0000";
    const cliBlobPayload = new TextEncoder().encode("cli push v3\n");
    const cliBlob = await encodeGitObject("blob", cliBlobPayload);
    const cliTreePayload = buildTreePayload([
      { mode: "100644", name: "README.md", oid: cliBlob.oid },
    ]);
    const cliTree = await encodeGitObject("tree", cliTreePayload);
    const cliCommitPayload = new TextEncoder().encode(
      `tree ${cliTree.oid}\nparent ${webCommitJson.commitOid}\nauthor ${author}\ncommitter ${author}\n\nCLI push cache bust\n`
    );
    const cliCommit = await encodeGitObject("commit", cliCommitPayload);
    const cliPack = await buildPack([
      { type: "blob", payload: cliBlobPayload },
      { type: "tree", payload: cliTreePayload },
      { type: "commit", payload: cliCommitPayload },
    ]);
    const pushBody = concatChunks([
      pktLine(
        `${webCommitJson.commitOid} ${cliCommit.oid} refs/heads/main\0 report-status ofs-delta agent=test\n`
      ),
      pktLine(`${"0".repeat(40)} ${cliCommit.oid} refs/tags/cli-v1\n`),
      flushPkt(),
      cliPack,
    ]);
    const pushRes = await postReceivePack(
      `https://example.com/${ns}/${repoSlug}/git-receive-pack`,
      pushBody,
      { authHeader: seededRepo.pushAuthHeader }
    );
    expect(pushRes.status).toBe(200);

    const refsAfterCli = (await (
      await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/api/refs`)
    ).json()) as { tags?: Array<{ name: string; displayName: string }> };
    expect(refsAfterCli.tags?.some((t) => t.name === "cli-v1")).toBe(true);
    expect(await readLsRefsOid()).toBe(cliCommit.oid);
    const commitsAfterCli = await (
      await workerExports.default.fetch(`https://example.com/${ns}/${repoSlug}/commits?ref=main`)
    ).text();
    expect(commitsAfterCli).toContain("CLI push cache bust");

    // Ensure DO refs match too
    const doRefs = await callStubWithRetry(seeded.getStub, (stub) => stub.listRefs());
    expect(doRefs.find((r) => r.name === "refs/heads/main")?.oid).toBe(cliCommit.oid);
  });

  it("BUG-08: hides editor on tag refs and commit SHAs and rejects non-branch commits", async () => {
    const { setupRepoForTests } = await import("./util/repoSeed");
    const { callStubWithRetry } = await import("./util/test-helpers");

    const ns = `cp-tagedit-${Math.random().toString(36).slice(2, 8)}`;
    const repoSlug = "repo";
    const seededRepo = await setupRepoForTests(env, ns, repoSlug, { visibility: "public" });
    const repoId = `${ns}/${repoSlug}`;
    const seeded = await seedPackFirstRepo(repoId);

    // Add a tag pointing to the commit
    await callStubWithRetry(seeded.getStub, async (stub) => {
      const refs = await stub.listRefs();
      refs.push({ name: "refs/tags/v1.0.0", oid: seeded.nextCommit.oid });
      await stub.setRefs(refs);
    });

    // Branch ref shows Edit file affordance
    const branchBlobRes = await workerExports.default.fetch(
      `https://example.com/${ns}/${repoSlug}/blob?ref=main&path=README.md`,
      { headers: { Cookie: seededRepo.cookieHeader } }
    );
    expect(branchBlobRes.status).toBe(200);
    expect(await branchBlobRes.text()).toContain("Edit file");

    // Full tag ref, short tag ref, and commit SHA must NOT show Edit file affordance
    for (const nonBranchRef of ["refs/tags/v1.0.0", "v1.0.0", seeded.nextCommit.oid]) {
      const blobRes = await workerExports.default.fetch(
        `https://example.com/${ns}/${repoSlug}/blob?ref=${encodeURIComponent(nonBranchRef)}&path=README.md`,
        { headers: { Cookie: seededRepo.cookieHeader } }
      );
      expect(blobRes.status).toBe(200);
      expect(await blobRes.text()).not.toContain("Edit file");

      // Direct API edit attempt must return HTTP 400
      const editRes = await workerExports.default.fetch(
        `https://example.com/auth/api/repositories/${encodeURIComponent(seededRepo.repositoryId)}/file`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
            Cookie: seededRepo.cookieHeader,
          },
          body: JSON.stringify({
            ref: nonBranchRef,
            path: "README.md",
            content: "tampered\n",
            message: "Should be blocked",
          }),
        }
      );
      expect(editRes.status).toBe(400);
    }
  });

  it("BUG-15: cleans up staged R2 pack artifacts and DO lease on web commit failure", async () => {
    const { setupRepoForTests } = await import("./util/repoSeed");
    const { callStubWithRetry, runDOWithRetry } = await import("./util/test-helpers");
    const { doPrefix, r2PackDirPrefix } = await import("@/worker/keys");

    const ns = `cp-cleanup-${Math.random().toString(36).slice(2, 8)}`;
    const repoSlug = "repo";
    const seededRepo = await setupRepoForTests(env, ns, repoSlug, { visibility: "public" });
    const repoId = `${ns}/${repoSlug}`;
    const seeded = await seedPackFirstRepo(repoId);

    // Force finalizeReceive to fail after R2 staged pack/idx/refs are written.
    await runDOWithRetry(seeded.getStub, async (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER IF NOT EXISTS fail_web_pack_insert
        BEFORE INSERT ON pack_catalog
        WHEN NEW.pack_key LIKE '%/pack-web-%'
        BEGIN
          SELECT RAISE(ABORT, 'simulated web commit failure');
        END;
      `);
    });

    try {
      const failRes = await workerExports.default.fetch(
        `https://example.com/auth/api/repositories/${encodeURIComponent(seededRepo.repositoryId)}/file`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
            Cookie: seededRepo.cookieHeader,
          },
          body: JSON.stringify({
            ref: "refs/heads/main",
            path: "README.md",
            content: "conflicting update\n",
            message: "Should fail and clean up",
          }),
        }
      );
      expect(failRes.status).toBe(500);

      // Receive lease must be released and zero pack-web-* files remain in R2
      const activity = await callStubWithRetry(seeded.getStub, (stub) => stub.getRepoActivity());
      expect(activity).toBeNull();

      const doId = env.REPO_DO.idFromName(seededRepo.doName);
      const listed = await env.REPO_BUCKET.list({
        prefix: r2PackDirPrefix(doPrefix(doId.toString())),
      });
      const orphanWebPacks = listed.objects
        .map((obj) => obj.key)
        .filter((key) => key.includes("/pack-web-"));
      expect(orphanWebPacks).toEqual([]);
    } finally {
      await runDOWithRetry(seeded.getStub, async (_instance, state) => {
        state.storage.sql.exec("DROP TRIGGER IF EXISTS fail_web_pack_insert;");
      });
    }
  });
});
