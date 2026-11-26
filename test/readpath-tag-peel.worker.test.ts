import { it, expect } from "vitest";
import { env } from "cloudflare:workers";
import { asTypedStorage, type RepoStateSchema } from "@/worker/do/repo/repoState";
import { uniqueRepoId, runDOWithRetry } from "./util/test-helpers";
import { setupRepoForTests } from "./util/repoSeed";
import { readPath } from "@/worker/git/operations/read";
import { encodeGitObject } from "@/worker/git/core/objects";
import { seedPackFirstRepo } from "./util/pack-first";
import { registerTestPack } from "./util/packed-repo";

it("readPath resolves tag to its target commit tree (tag peel)", async () => {
  const owner = "o";
  const repo = uniqueRepoId("r-readpath-tag");
  await setupRepoForTests(env, owner, repo);
  const repoId = `${owner}/${repo}`;
  const seeded = await seedPackFirstRepo(repoId);
  const id = env.REPO_DO.idFromName(repoId);
  const getStub = () => env.REPO_DO.get(id);

  // Create an annotated tag object pointing to the seeded commit
  const commitOid = seeded.nextCommit.oid;
  const tagPayload = new TextEncoder().encode(
    `object ${commitOid}\n` +
      `type commit\n` +
      `tag v1\n` +
      `tagger Test <test@example.com> 0 +0000\n` +
      `\n` +
      `message\n`
  );
  const { oid: tagOid } = await encodeGitObject("tag", tagPayload);

  // Pack the tag and register it
  await registerTestPack({
    env,
    repoId,
    getStub,
    packName: "pack-tag.pack",
    objects: [{ type: "tag", payload: tagPayload }],
  });

  // Add the tag ref
  await runDOWithRetry(getStub, async (_instance, state) => {
    const store = asTypedStorage<RepoStateSchema>(state.storage);
    const refs = ((await store.get("refs")) || []) as { name: string; oid: string }[];
    refs.push({ name: "refs/tags/v1", oid: tagOid });
    await store.put("refs", refs);
  });

  // Call readPath with the tag ref; expect a tree result (root tree of the tagged commit)
  const result = await readPath(env as unknown as Env, repoId, "refs/tags/v1");
  expect(result.type).toBe("tree");
  if (result.type === "tree") {
    expect(Array.isArray(result.entries)).toBe(true);
  }
});

it("readPath peels multi-hop tag->tag->commit as well as tag->tree and tag->blob", async () => {
  const owner = "o";
  const repo = uniqueRepoId("r-readpath-multihop");
  await setupRepoForTests(env, owner, repo);
  const repoId = `${owner}/${repo}`;
  const seeded = await seedPackFirstRepo(repoId);
  const id = env.REPO_DO.idFromName(repoId);
  const getStub = () => env.REPO_DO.get(id);

  const commitOid = seeded.nextCommit.oid;
  const innerTagPayload = new TextEncoder().encode(
    `object ${commitOid}\ntype commit\ntag v1-inner\ntagger Test <test@example.com> 0 +0000\n\ninner\n`
  );
  const innerTag = await encodeGitObject("tag", innerTagPayload);

  const outerTagPayload = new TextEncoder().encode(
    `object ${innerTag.oid}\ntype tag\ntag v1-outer\ntagger Test <test@example.com> 0 +0000\n\nouter\n`
  );
  const outerTag = await encodeGitObject("tag", outerTagPayload);

  const treeTagPayload = new TextEncoder().encode(
    `object ${seeded.nextTree.oid}\ntype tree\ntag v-tree\ntagger Test <test@example.com> 0 +0000\n\ntree tag\n`
  );
  const treeTag = await encodeGitObject("tag", treeTagPayload);

  const blobTagPayload = new TextEncoder().encode(
    `object ${seeded.nextBlob.oid}\ntype blob\ntag v-blob\ntagger Test <test@example.com> 0 +0000\n\nblob tag\n`
  );
  const blobTag = await encodeGitObject("tag", blobTagPayload);

  await registerTestPack({
    env,
    repoId,
    getStub,
    packName: "pack-multihop-tags.pack",
    objects: [
      { type: "tag", payload: innerTagPayload },
      { type: "tag", payload: outerTagPayload },
      { type: "tag", payload: treeTagPayload },
      { type: "tag", payload: blobTagPayload },
    ],
  });

  await runDOWithRetry(getStub, async (_instance, state) => {
    const store = asTypedStorage<RepoStateSchema>(state.storage);
    const refs = ((await store.get("refs")) || []) as { name: string; oid: string }[];
    refs.push(
      { name: "refs/tags/v1-outer", oid: outerTag.oid },
      { name: "refs/tags/v-tree", oid: treeTag.oid },
      { name: "refs/tags/v-blob", oid: blobTag.oid }
    );
    await store.put("refs", refs);
  });

  const multiHopRes = await readPath(env as unknown as Env, repoId, "refs/tags/v1-outer");
  expect(multiHopRes.type).toBe("tree");

  const treeTagRes = await readPath(env as unknown as Env, repoId, "refs/tags/v-tree");
  expect(treeTagRes.type).toBe("tree");

  const blobTagRes = await readPath(env as unknown as Env, repoId, "refs/tags/v-blob");
  expect(blobTagRes.type).toBe("blob");
});
