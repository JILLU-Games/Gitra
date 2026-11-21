import type { Db } from "@/worker/db/d1/client";
import type { Logger } from "@/worker/common/logger";
import type { Limiter } from "@/worker/git/operations/limits";
import type { GitObjectType } from "@/worker/git/core/objects";

import { getRepoStub, hexToBytes, newPrefixedId, zeroOid } from "@/worker/common";
import { insertRepositoryIfNew, listRepositoriesForUser } from "@/worker/db/d1/dal";
import { concatChunks } from "@/worker/git";
import { createGitObject } from "@/worker/git/core/objects";
import { buildPackV2 } from "@/worker/git/pack/build";
import { resolveDeltasAndWriteIdx, scanPack } from "@/worker/git/pack/indexer";
import { doPrefix, r2PackKey } from "@/worker/keys";
import { putRouteCacheRecord } from "@/worker/repositories/routeCache";

/**
 * Seeds starter Git repositories for Live Preview / Demo Mode when the admin
 * account signs in for the first time with no existing repositories.
 *
 * Each seeded repository receives a genuine Git packfile (.pack + .idx) in R2
 * committed through the standard single-hop Worker -> R2 + Worker -> DO
 * `beginReceive` / `finalizeReceive` flow so every page (Overview, Tree, Blob,
 * Commits, Commit Diff, Repo Admin) displays live repository data immediately.
 */

type SeedFileSpec = {
  path: string;
  content: string;
};

type SeedCommitSpec = {
  message: string;
  timestampSec: number;
  files: SeedFileSpec[];
};

type SeedRepoSpec = {
  slug: string;
  visibility: "public" | "private";
  commits: SeedCommitSpec[];
};

type PackObjectInput = {
  type: GitObjectType;
  payload: Uint8Array;
};

const textEncoder = new TextEncoder();

const DEMO_REPOSITORIES: readonly SeedRepoSpec[] = [
  {
    slug: "edge-starter",
    visibility: "public",
    commits: [
      {
        message: "Initial scaffold for edge worker\n",
        timestampSec: 1763600000,
        files: [
          {
            path: "README.md",
            content: [
              "# edge-starter",
              "",
              "Minimal Cloudflare Worker template hosted directly on **git-on-cloudflare**.",
              "",
              "## Quick start",
              "",
              "```bash",
              "npm install",
              "npm run dev",
              "```",
              "",
            ].join("\n"),
          },
          {
            path: "wrangler.jsonc",
            content: [
              "{",
              '  "name": "edge-starter",',
              '  "main": "src/index.ts",',
              '  "compatibility_date": "2026-05-13"',
              "}",
              "",
            ].join("\n"),
          },
        ],
      },
      {
        message: "Add health endpoint and structured request logger\n",
        timestampSec: 1763686400,
        files: [
          {
            path: "README.md",
            content: [
              "# edge-starter",
              "",
              "Minimal Cloudflare Worker template hosted directly on **git-on-cloudflare**.",
              "",
              "## Endpoints",
              "",
              "- `GET /` — Returns service metadata",
              "- `GET /health` — Lightweight edge health check",
              "",
              "## Quick start",
              "",
              "```bash",
              "npm install",
              "npm run dev",
              "```",
              "",
            ].join("\n"),
          },
          {
            path: "wrangler.jsonc",
            content: [
              "{",
              '  "name": "edge-starter",',
              '  "main": "src/index.ts",',
              '  "compatibility_date": "2026-05-13"',
              "}",
              "",
            ].join("\n"),
          },
          {
            path: "src/index.ts",
            content: [
              "export interface Env {",
              "  LOG_LEVEL?: string;",
              "}",
              "",
              "export default {",
              "  async fetch(request: Request): Promise<Response> {",
              "    const url = new URL(request.url);",
              '    if (url.pathname === "/health") {',
              '      return Response.json({ status: "ok", timestamp: Date.now() });',
              "    }",
              "    return Response.json({",
              '      service: "edge-starter",',
              "      path: url.pathname,",
              "    });",
              "  },",
              "};",
              "",
            ].join("\n"),
          },
        ],
      },
    ],
  },
  {
    slug: "infra-notes",
    visibility: "private",
    commits: [
      {
        message: "Document edge forge operations runbook\n",
        timestampSec: 1763690000,
        files: [
          {
            path: "README.md",
            content: [
              "# infra-notes",
              "",
              "Private operational notes for maintaining edge repositories, pack compaction, and access tokens.",
              "",
              "- See `runbook.md` for routine maintenance checklists.",
              "",
            ].join("\n"),
          },
          {
            path: "runbook.md",
            content: [
              "# Operations Runbook",
              "",
              "## Pack Compaction",
              "",
              "1. Open the repository Admin tab.",
              "2. Run a compaction dry-run to inspect active pack tiers.",
              "3. Queue compaction when tier-0 receive packs accumulate.",
              "",
              "## Access Tokens",
              "",
              "Create scoped Personal Access Tokens from the Account dashboard before pushing over Git Smart HTTP.",
              "",
            ].join("\n"),
          },
        ],
      },
    ],
  },
];

type TreeNode = {
  files: Map<string, string>;
  dirs: Map<string, TreeNode>;
};

function createTreeNode(): TreeNode {
  return { files: new Map(), dirs: new Map() };
}

function encodeTreePayload(entries: Array<{ mode: string; name: string; oid: string }>): Uint8Array {
  // Git sorts tree entries by byte order, treating directories as having a trailing `/`.
  const sorted = [...entries].sort((a, b) => {
    const aKey = a.mode === "40000" ? `${a.name}/` : a.name;
    const bKey = b.mode === "40000" ? `${b.name}/` : b.name;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  const chunks: Uint8Array[] = [];
  for (const entry of sorted) {
    chunks.push(textEncoder.encode(`${entry.mode} ${entry.name}\0`));
    chunks.push(hexToBytes(entry.oid));
  }
  return concatChunks(chunks);
}

async function encodeDirectoryTree(
  node: TreeNode,
  objectsByOid: Map<string, PackObjectInput>
): Promise<string> {
  const entries: Array<{ mode: string; name: string; oid: string }> = [];

  for (const [name, content] of node.files) {
    const payload = textEncoder.encode(content);
    const { oid } = await createGitObject("blob", payload);
    if (!objectsByOid.has(oid)) {
      objectsByOid.set(oid, { type: "blob", payload });
    }
    entries.push({ mode: "100644", name, oid });
  }

  for (const [dirName, childNode] of node.dirs) {
    const dirOid = await encodeDirectoryTree(childNode, objectsByOid);
    entries.push({ mode: "40000", name: dirName, oid: dirOid });
  }

  const treePayload = encodeTreePayload(entries);
  const { oid } = await createGitObject("tree", treePayload);
  if (!objectsByOid.has(oid)) {
    objectsByOid.set(oid, { type: "tree", payload: treePayload });
  }
  return oid;
}

async function buildRepoPackObjects(commits: readonly SeedCommitSpec[]): Promise<{
  objects: PackObjectInput[];
  headCommitOid: string;
}> {
  const objectsByOid = new Map<string, PackObjectInput>();
  let parentOid: string | null = null;

  for (const commit of commits) {
    const root = createTreeNode();
    for (const file of commit.files) {
      const parts = file.path.split("/").filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) continue;
      let cursor = root;
      for (const part of parts) {
        let next = cursor.dirs.get(part);
        if (!next) {
          next = createTreeNode();
          cursor.dirs.set(part, next);
        }
        cursor = next;
      }
      cursor.files.set(fileName, file.content);
    }

    const treeOid = await encodeDirectoryTree(root, objectsByOid);
    const ident = `Admin <admin@local.dev> ${commit.timestampSec} +0000`;
    const lines = [`tree ${treeOid}`];
    if (parentOid) {
      lines.push(`parent ${parentOid}`);
    }
    lines.push(`author ${ident}`, `committer ${ident}`, "", commit.message);
    const commitPayload = textEncoder.encode(lines.join("\n"));
    const { oid: commitOid } = await createGitObject("commit", commitPayload);
    if (!objectsByOid.has(commitOid)) {
      objectsByOid.set(commitOid, { type: "commit", payload: commitPayload });
    }
    parentOid = commitOid;
  }

  if (!parentOid) {
    throw new Error("Demo repository specification must contain at least one commit");
  }

  return {
    objects: Array.from(objectsByOid.values()),
    headCommitOid: parentOid,
  };
}

async function seedSingleDemoRepository(args: {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  userId: string;
  namespaceId: string;
  namespaceSlug: string;
  spec: SeedRepoSpec;
  now: number;
}): Promise<void> {
  const repositoryId = newPrefixedId("repo");
  const doName = `repo:${repositoryId.slice("repo_".length)}`;

  const inserted = await insertRepositoryIfNew(args.db, {
    id: repositoryId,
    namespaceId: args.namespaceId,
    createdBy: args.userId,
    slug: args.spec.slug,
    doName,
    visibility: args.spec.visibility,
    createdAt: args.now,
    updatedAt: args.now,
  });
  if (!inserted) return;

  await putRouteCacheRecord(args.env, args.namespaceSlug, args.spec.slug, {
    repositoryId: inserted.id,
    namespaceId: args.namespaceId,
    doName: inserted.doName,
    updatedAt: args.now,
  });

  const stub = getRepoStub(args.env, inserted.doName);
  const leaseResult = await args.limiter.run(
    "do:demo-begin-receive",
    async () => await stub.beginReceive()
  );
  if (!leaseResult.ok) {
    args.log.warn("demo-seed:lease-busy", { slug: args.spec.slug });
    return;
  }

  const token = leaseResult.lease.token;
  try {
    const { objects, headCommitOid } = await buildRepoPackObjects(args.spec.commits);
    const packData = await buildPackV2(objects);
    const packKey = r2PackKey(doPrefix(stub.id.toString()), `pack-demo-${args.now}.pack`);

    await args.limiter.run("r2:demo-put-pack", () => args.env.REPO_BUCKET.put(packKey, packData));

    const scanResult = await scanPack({
      env: args.env,
      packKey,
      packSize: packData.byteLength,
      limiter: args.limiter,
      countSubrequest: () => {},
      log: args.log,
    });
    const resolveResult = await resolveDeltasAndWriteIdx({
      env: args.env,
      packKey,
      packSize: packData.byteLength,
      limiter: args.limiter,
      countSubrequest: () => {},
      log: args.log,
      scanResult,
      repoId: inserted.doName,
    });

    const finalized = await args.limiter.run(
      "do:demo-finalize-receive",
      async () =>
        await stub.finalizeReceive({
          token,
          commands: [{ oldOid: zeroOid(), newOid: headCommitOid, ref: "refs/heads/main" }],
          stagedPack: {
            packKey,
            packBytes: packData.byteLength,
            idxBytes: resolveResult.idxBytes,
            objectCount: resolveResult.objectCount,
          },
        })
    );

    if (finalized.status !== "committed") {
      args.log.warn("demo-seed:finalize-non-committed", {
        slug: args.spec.slug,
        status: finalized.status,
      });
    } else {
      args.log.info("demo-seed:repo-ready", {
        slug: args.spec.slug,
        visibility: args.spec.visibility,
        objects: resolveResult.objectCount,
      });
    }
  } catch (error) {
    args.log.warn("demo-seed:pack-init-failed", {
      slug: args.spec.slug,
      error: String(error),
    });
    await args.limiter
      .run("do:demo-abort-receive", async () => await stub.abortReceive(token))
      .catch(() => {});
  }
}

export async function ensureDemoRepositoriesSeeded(args: {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  userId: string;
  namespaceId: string;
  namespaceSlug: string;
  now: number;
}): Promise<void> {
  const existing = await listRepositoriesForUser(args.db, args.userId);
  if (existing.length > 0) return;

  for (const spec of DEMO_REPOSITORIES) {
    await seedSingleDemoRepository({
      env: args.env,
      db: args.db,
      limiter: args.limiter,
      log: args.log,
      userId: args.userId,
      namespaceId: args.namespaceId,
      namespaceSlug: args.namespaceSlug,
      spec,
      now: args.now,
    });
  }
}
