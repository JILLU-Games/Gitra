import { buildCacheKeyFrom, cacheDeleteJSON, type CacheContext } from "@/worker/cache";
import type { Db } from "@/worker/db/d1/client";
import type { Logger } from "@/worker/common/logger";
import type { GitObjectType } from "@/worker/git/core/objects";
import type { Limiter } from "@/worker/git/operations/limits";
import type { TreeEntry } from "@/worker/git/operations/read/types";

import { getRepoStub, hexToBytes, zeroOid } from "@/worker/common";
import { shortRefName } from "@/shared/git/ref-display";
import { touchRepositoryUpdatedAt } from "@/worker/db/d1/dal";
import { concatChunks } from "@/worker/git";
import { createGitObject } from "@/worker/git/core/objects";
import { readCommit } from "@/worker/git/operations/read/commits";
import { readTree } from "@/worker/git/operations/read/tree";
import { buildPackV2 } from "@/worker/git/pack/build";
import { resolveDeltasAndWriteIdx, scanPack } from "@/worker/git/pack/indexer";
import { doPrefix, r2PackKey } from "@/worker/keys";

const textEncoder = new TextEncoder();

type PackObjectInput = {
  type: GitObjectType;
  payload: Uint8Array;
};

export type CommitFileInput = {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  cacheCtx: CacheContext;
  repositoryId: string;
  doName: string;
  filePath: string;
  content: string;
  commitMessage: string;
  authorName: string;
  authorEmail: string;
  targetRef?: string;
};

export type CommitFileResult =
  | { ok: true; commitOid: string; ref: string; unchanged: boolean }
  | { ok: false; reason: "invalid-path" | "repo-busy" | "commit-failed"; detail?: string };

function normalizeRepoFilePath(raw: string): string[] | null {
  const cleaned = raw.trim().replace(/^\/+/, "");
  if (!cleaned) return null;
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === "." || part === ".." || part.includes("\0")) return null;
  }
  return parts;
}

function encodeTreePayload(entries: TreeEntry[]): Uint8Array {
  // Git sorts tree entries in byte order with directory names suffixed by `/`.
  const sorted = [...entries].sort((a, b) => {
    const aKey = a.mode.startsWith("40000") ? `${a.name}/` : a.name;
    const bKey = b.mode.startsWith("40000") ? `${b.name}/` : b.name;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  const chunks: Uint8Array[] = [];
  for (const entry of sorted) {
    chunks.push(textEncoder.encode(`${entry.mode} ${entry.name}\0`));
    chunks.push(hexToBytes(entry.oid));
  }
  return concatChunks(chunks);
}

function sanitizeIdentPart(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\r\n<>]/g, " ").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

async function upsertTreePath(args: {
  env: Env;
  doName: string;
  cacheCtx: CacheContext;
  currentTreeOid: string | null;
  parts: string[];
  depth: number;
  blobOid: string;
  objectsByOid: Map<string, PackObjectInput>;
}): Promise<string> {
  const segment = args.parts[args.depth]!;
  const isLeaf = args.depth === args.parts.length - 1;

  const existingEntries: TreeEntry[] = args.currentTreeOid
    ? await readTree(args.env, args.doName, args.currentTreeOid, args.cacheCtx)
    : [];

  let nextChildOid: string;
  let nextChildMode: string;

  if (isLeaf) {
    nextChildOid = args.blobOid;
    nextChildMode = "100644";
  } else {
    const existingSubtree = existingEntries.find(
      (entry) => entry.name === segment && entry.mode.startsWith("40000")
    );
    nextChildOid = await upsertTreePath({
      env: args.env,
      doName: args.doName,
      cacheCtx: args.cacheCtx,
      currentTreeOid: existingSubtree ? existingSubtree.oid : null,
      parts: args.parts,
      depth: args.depth + 1,
      blobOid: args.blobOid,
      objectsByOid: args.objectsByOid,
    });
    nextChildMode = "40000";
  }

  const nextEntries = existingEntries.filter((entry) => entry.name !== segment);
  nextEntries.push({
    mode: nextChildMode,
    name: segment,
    oid: nextChildOid,
  });

  const payload = encodeTreePayload(nextEntries);
  const { oid } = await createGitObject("tree", payload);
  if (!args.objectsByOid.has(oid)) {
    args.objectsByOid.set(oid, { type: "tree", payload });
  }
  return oid;
}

/**
 * Commits a single file directly to a repository's branch using the standard
 * single-hop `beginReceive -> R2 pack/idx -> finalizeReceive` pipeline so
 * browser edits create genuine Git commits, trees, and blobs.
 */
export async function commitRepositoryFile(input: CommitFileInput): Promise<CommitFileResult> {
  const parts = normalizeRepoFilePath(input.filePath);
  if (!parts) {
    return { ok: false, reason: "invalid-path" };
  }

  // Bypass edge cache while constructing parent tree diffs so we always read
  // authoritative DO refs and active R2 pack contents.
  const freshCacheCtx: CacheContext = {
    req: input.cacheCtx.req,
    ctx: input.cacheCtx.ctx,
    memo: {
      repoId: input.doName,
      flags: new Set(["no-cache-read", "no-cache-write"]),
      limiter: input.limiter,
    },
  };

  const stub = getRepoStub(input.env, input.doName);
  const headAndRefs = await input.limiter.run(
    "do:commit-head-refs",
    async () => await stub.getHeadAndRefs()
  );

  const requestedTarget = input.targetRef || headAndRefs.head.target || "refs/heads/main";
  const branchRef = requestedTarget.startsWith("refs/heads/")
    ? requestedTarget
    : `refs/heads/${requestedTarget.replace(/^refs\/[^/]+\//, "")}`;

  const existingRef = headAndRefs.refs.find((ref) => ref.name === branchRef);
  const oldOid = existingRef?.oid || zeroOid();
  const hasParentCommit = oldOid !== zeroOid();

  let parentTreeOid: string | null = null;
  if (hasParentCommit) {
    const parentCommit = await readCommit(input.env, input.doName, oldOid, freshCacheCtx);
    parentTreeOid = parentCommit.tree;
  }

  const objectsByOid = new Map<string, PackObjectInput>();
  const blobPayload = textEncoder.encode(input.content);
  const { oid: blobOid } = await createGitObject("blob", blobPayload);
  objectsByOid.set(blobOid, { type: "blob", payload: blobPayload });

  const newTreeOid = await upsertTreePath({
    env: input.env,
    doName: input.doName,
    cacheCtx: freshCacheCtx,
    currentTreeOid: parentTreeOid,
    parts,
    depth: 0,
    blobOid,
    objectsByOid,
  });

  if (parentTreeOid && newTreeOid === parentTreeOid) {
    input.log.info("web-commit:unchanged", {
      repositoryId: input.repositoryId,
      ref: branchRef,
      path: parts.join("/"),
    });
    return { ok: true, commitOid: oldOid, ref: branchRef, unchanged: true };
  }

  const now = Date.now();
  const timestampSec = Math.floor(now / 1000);
  const cleanName = sanitizeIdentPart(input.authorName, "Administrator");
  const cleanEmail = sanitizeIdentPart(input.authorEmail, "admin@local.dev");
  const ident = `${cleanName} <${cleanEmail}> ${timestampSec} +0000`;

  const message = input.commitMessage.trim()
    ? `${input.commitMessage.trim()}\n`
    : `Update ${parts.join("/")}\n`;

  const commitLines = [`tree ${newTreeOid}`];
  if (hasParentCommit) {
    commitLines.push(`parent ${oldOid}`);
  }
  commitLines.push(`author ${ident}`, `committer ${ident}`, "", message);

  const commitPayload = textEncoder.encode(commitLines.join("\n"));
  const { oid: commitOid } = await createGitObject("commit", commitPayload);
  objectsByOid.set(commitOid, { type: "commit", payload: commitPayload });

  const leaseResult = await input.limiter.run(
    "do:commit-begin-receive",
    async () => await stub.beginReceive()
  );
  if (!leaseResult.ok) {
    input.log.warn("web-commit:lease-busy", {
      repositoryId: input.repositoryId,
      path: parts.join("/"),
    });
    return { ok: false, reason: "repo-busy" };
  }

  const token = leaseResult.lease.token;
  try {
    const packData = await buildPackV2(Array.from(objectsByOid.values()));
    const packKey = r2PackKey(
      doPrefix(stub.id.toString()),
      `pack-web-${now}-${crypto.randomUUID().slice(0, 8)}.pack`
    );

    await input.limiter.run("r2:commit-put-pack", () =>
      input.env.REPO_BUCKET.put(packKey, packData)
    );

    const scanResult = await scanPack({
      env: input.env,
      packKey,
      packSize: packData.byteLength,
      limiter: input.limiter,
      countSubrequest: () => {},
      log: input.log,
    });

    const resolveResult = await resolveDeltasAndWriteIdx({
      env: input.env,
      packKey,
      packSize: packData.byteLength,
      limiter: input.limiter,
      countSubrequest: () => {},
      log: input.log,
      scanResult,
      repoId: input.doName,
    });

    const finalized = await input.limiter.run(
      "do:commit-finalize-receive",
      async () =>
        await stub.finalizeReceive({
          token,
          commands: [{ oldOid, newOid: commitOid, ref: branchRef }],
          stagedPack: {
            packKey,
            packBytes: packData.byteLength,
            idxBytes: resolveResult.idxBytes,
            objectCount: resolveResult.objectCount,
          },
        })
    );

    if (finalized.status !== "committed") {
      input.log.warn("web-commit:finalize-non-committed", {
        repositoryId: input.repositoryId,
        status: finalized.status,
      });
      return {
        ok: false,
        reason: "commit-failed",
        detail: `Finalize status: ${finalized.status}`,
      };
    }

    const shortBranch = shortRefName(branchRef);
    const parentDir = parts.slice(0, -1).join("/");
    const cacheDeletions = [
      cacheDeleteJSON(
        buildCacheKeyFrom(input.cacheCtx.req, "/_cache/refs", { repo: input.doName })
      ),
      cacheDeleteJSON(
        buildCacheKeyFrom(input.cacheCtx.req, "/_cache/readme", {
          repo: input.doName,
          ref: shortBranch,
        })
      ),
      cacheDeleteJSON(
        buildCacheKeyFrom(input.cacheCtx.req, "/_cache/tree", {
          repo: input.doName,
          ref: shortBranch,
          path: "",
        })
      ),
    ];
    if (parentDir) {
      cacheDeletions.push(
        cacheDeleteJSON(
          buildCacheKeyFrom(input.cacheCtx.req, "/_cache/tree", {
            repo: input.doName,
            ref: shortBranch,
            path: parentDir,
          })
        )
      );
    }
    await touchRepositoryUpdatedAt(input.db, input.repositoryId, now);
    await Promise.all(cacheDeletions);
    input.log.info("web-commit:ok", {
      repositoryId: input.repositoryId,
      commitOid,
      ref: branchRef,
      path: parts.join("/"),
      objects: resolveResult.objectCount,
    });

    return { ok: true, commitOid, ref: branchRef, unchanged: false };
  } catch (error) {
    input.log.warn("web-commit:failed", {
      repositoryId: input.repositoryId,
      path: parts.join("/"),
      error: String(error),
    });
    await input.limiter
      .run("do:commit-abort-receive", async () => await stub.abortReceive(token))
      .catch(() => {});
    return { ok: false, reason: "commit-failed", detail: String(error) };
  }
}
