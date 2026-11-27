import { buildCacheKeyFrom, cacheDeleteJSON, type CacheContext } from "@/worker/cache";
import type { Db } from "@/worker/db/d1/client";
import type { Logger } from "@/worker/common/logger";
import type { GitObjectType } from "@/worker/git/core/objects";
import type { Limiter } from "@/worker/git/operations/limits";
import type { TreeEntry } from "@/worker/git/operations/read/types";
import type { Head, Ref } from "@/worker/do/repo/repoState";

import {
  getRepoStub,
  hexToBytes,
  shouldAutoQueueBackgroundCompaction,
  zeroOid,
} from "@/worker/common";
import { sendOptionalMaintenanceTask } from "@/worker/tasks/dispatch";
import { shortRefName } from "@/shared/git/ref-display";
import { OID_RE } from "@/shared/web";
import { findRepositoryById, touchRepositoryUpdatedAt } from "@/worker/db/d1/dal";
import { concatChunks } from "@/worker/git";
import { createGitObject } from "@/worker/git/core/objects";
import { readCommit } from "@/worker/git/operations/read/commits";
import { readTree } from "@/worker/git/operations/read/tree";
import { isValidRefName } from "@/worker/git/operations/validation";
import { buildPackV2 } from "@/worker/git/pack/build";
import { resolveDeltasAndWriteIdx, scanPack } from "@/worker/git/pack/indexer";
import { doPrefix, packIndexKey, packRefsKey, r2PackKey } from "@/worker/keys";
import { deleteRepoBranchCacheRecord } from "@/worker/repositories/routeCache";

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
  content: string | Uint8Array;
  commitMessage: string;
  authorName: string;
  authorEmail: string;
  targetRef?: string;
};

export type TreeMutationOperation =
  | {
      kind: "upsert";
      filePath: string;
      content: string | Uint8Array;
    }
  | {
      kind: "delete";
      filePath: string;
    }
  | {
      kind: "move";
      fromPath: string;
      toPath: string;
      content?: string | Uint8Array;
    };

export type CommitMutationInput = {
  env: Env;
  db: Db;
  limiter: Limiter;
  log: Logger;
  cacheCtx: CacheContext;
  repositoryId: string;
  doName: string;
  operation: TreeMutationOperation;
  commitMessage: string;
  authorName: string;
  authorEmail: string;
  targetRef?: string;
};

export type CommitFileResult =
  | { ok: true; commitOid: string; ref: string; unchanged: boolean }
  | {
      ok: false;
      reason: "invalid-path" | "invalid-ref" | "not-found" | "repo-busy" | "commit-failed";
      detail?: string;
    };

export function resolveEditableBranchRef(
  rawTarget: string,
  headAndRefs: { head: Head; refs: Ref[] }
): string | null {
  const target = rawTarget.trim();
  if (!target || OID_RE.test(target)) return null;
  if (target === "HEAD") {
    const headTarget = headAndRefs.head.target;
    return headTarget && headTarget.startsWith("refs/heads/") && isValidRefName(headTarget)
      ? headTarget
      : null;
  }
  if (target.startsWith("refs/")) {
    return target.startsWith("refs/heads/") && isValidRefName(target) ? target : null;
  }
  const branchCandidate = `refs/heads/${target}`;
  if (!isValidRefName(branchCandidate)) return null;
  const hasBranch = headAndRefs.refs.some((ref) => ref.name === branchCandidate);
  const hasTag = headAndRefs.refs.some((ref) => ref.name === `refs/tags/${target}`);
  if (!hasBranch && hasTag) return null;
  return branchCandidate;
}

async function cleanupFailedWebCommit(args: {
  input: Pick<CommitMutationInput, "env" | "limiter" | "log" | "repositoryId">;
  stub: ReturnType<typeof getRepoStub>;
  token: string;
  packKey: string | undefined;
}): Promise<void> {
  await args.input.limiter
    .run("do:commit-abort-receive", async () => await args.stub.abortReceive(args.token))
    .catch(() => {});

  if (!args.packKey) return;
  const keys = [args.packKey, packIndexKey(args.packKey), packRefsKey(args.packKey)];
  for (const key of keys) {
    await args.input.limiter
      .run("r2:commit-cleanup-staged", async () => await args.input.env.REPO_BUCKET.delete(key))
      .catch((cleanupErr) => {
        args.input.log.warn("web-commit:cleanup-r2-failed", {
          repositoryId: args.input.repositoryId,
          key,
          error: String(cleanupErr),
        });
      });
  }
}

export function normalizeRepoFilePath(raw: string): string[] | null {
  const cleaned = raw.trim().replace(/^\/+/, "");
  if (!cleaned) return null;
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === "." || part === ".." || part.includes("\0")) return null;
  }
  return parts;
}

function toBlobBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? textEncoder.encode(content) : content;
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

export type UpsertTreeEntryPlan =
  | {
      ok: true;
      mode: "100644" | "100755" | "120000" | "40000";
      existingSubtreeOid: string | null;
    }
  | {
      ok: false;
      reason: "invalid-path";
      detail: string;
    };

export function resolveUpsertTreeEntryPlan(
  existingEntries: readonly TreeEntry[],
  segment: string,
  isLeaf: boolean,
  explicitMode?: "100644" | "100755" | "120000"
): UpsertTreeEntryPlan {
  const existing = existingEntries.find((entry) => entry.name === segment);
  if (isLeaf) {
    if (existing && existing.mode !== "100644" && existing.mode !== "100755") {
      return {
        ok: false,
        reason: "invalid-path",
        detail: `Cannot overwrite non-regular file entry '${segment}' (mode ${existing.mode}).`,
      };
    }
    const mode = explicitMode ?? (existing?.mode === "100755" ? "100755" : "100644");
    return {
      ok: true,
      mode,
      existingSubtreeOid: null,
    };
  }

  if (existing && !existing.mode.startsWith("40000")) {
    return {
      ok: false,
      reason: "invalid-path",
      detail: `Path segment '${segment}' already exists as a non-directory entry (mode ${existing.mode}).`,
    };
  }
  return {
    ok: true,
    mode: "40000",
    existingSubtreeOid: existing ? existing.oid : null,
  };
}

type UpsertTreePathResult =
  { ok: true; treeOid: string } | { ok: false; reason: "invalid-path"; detail: string };

async function upsertTreePath(args: {
  env: Env;
  doName: string;
  cacheCtx: CacheContext;
  currentTreeOid: string | null;
  parts: string[];
  depth: number;
  blobOid: string;
  explicitMode?: "100644" | "100755" | "120000";
  objectsByOid: Map<string, PackObjectInput>;
}): Promise<UpsertTreePathResult> {
  const segment = args.parts[args.depth]!;
  const isLeaf = args.depth === args.parts.length - 1;

  const existingEntries: TreeEntry[] = args.currentTreeOid
    ? await readTree(args.env, args.doName, args.currentTreeOid, args.cacheCtx)
    : [];

  const plan = resolveUpsertTreeEntryPlan(existingEntries, segment, isLeaf, args.explicitMode);
  if (!plan.ok) {
    return plan;
  }

  let nextChildOid: string;
  if (isLeaf) {
    nextChildOid = args.blobOid;
  } else {
    const childResult = await upsertTreePath({
      env: args.env,
      doName: args.doName,
      cacheCtx: args.cacheCtx,
      currentTreeOid: plan.existingSubtreeOid,
      parts: args.parts,
      depth: args.depth + 1,
      blobOid: args.blobOid,
      explicitMode: args.explicitMode,
      objectsByOid: args.objectsByOid,
    });
    if (!childResult.ok) {
      return childResult;
    }
    nextChildOid = childResult.treeOid;
  }

  const nextEntries = existingEntries.filter((entry) => entry.name !== segment);
  nextEntries.push({
    mode: plan.mode,
    name: segment,
    oid: nextChildOid,
  });

  const payload = encodeTreePayload(nextEntries);
  const { oid } = await createGitObject("tree", payload);
  if (!args.objectsByOid.has(oid)) {
    args.objectsByOid.set(oid, { type: "tree", payload });
  }
  return { ok: true, treeOid: oid };
}

type ReadTreeEntryResult =
  | { ok: true; entry: TreeEntry }
  | { ok: false; reason: "not-found" | "invalid-path"; detail: string };

async function readTreeEntryAtPath(args: {
  env: Env;
  doName: string;
  cacheCtx: CacheContext;
  rootTreeOid: string | null;
  parts: string[];
}): Promise<ReadTreeEntryResult> {
  let currentTreeOid = args.rootTreeOid;
  for (let i = 0; i < args.parts.length; i++) {
    if (!currentTreeOid) {
      return {
        ok: false,
        reason: "not-found",
        detail: `Path '${args.parts.join("/")}' does not exist on this branch.`,
      };
    }
    const entries = await readTree(args.env, args.doName, currentTreeOid, args.cacheCtx);
    const segment = args.parts[i]!;
    const entry = entries.find((item) => item.name === segment);
    if (!entry) {
      return {
        ok: false,
        reason: "not-found",
        detail: `Path '${args.parts.join("/")}' does not exist on this branch.`,
      };
    }
    const isLeaf = i === args.parts.length - 1;
    if (isLeaf) {
      if (entry.mode.startsWith("40000")) {
        return {
          ok: false,
          reason: "invalid-path",
          detail: `Target '${args.parts.join("/")}' is a directory, not a file.`,
        };
      }
      return { ok: true, entry };
    }
    if (!entry.mode.startsWith("40000")) {
      return {
        ok: false,
        reason: "not-found",
        detail: `Parent segment '${segment}' is not a directory.`,
      };
    }
    currentTreeOid = entry.oid;
  }
  return {
    ok: false,
    reason: "invalid-path",
    detail: "File path cannot be empty.",
  };
}

export function resolveDeleteTreeEntries(
  existingEntries: readonly TreeEntry[],
  segment: string,
  childResultOid: string | null
): TreeEntry[] {
  const withoutSegment = existingEntries.filter((entry) => entry.name !== segment);
  if (childResultOid === null) {
    return withoutSegment;
  }
  withoutSegment.push({
    mode: "40000",
    name: segment,
    oid: childResultOid,
  });
  return withoutSegment;
}

type DeleteTreePathResult =
  | { ok: true; treeOid: string | null }
  | { ok: false; reason: "not-found" | "invalid-path"; detail: string };

async function deleteTreePath(args: {
  env: Env;
  doName: string;
  cacheCtx: CacheContext;
  currentTreeOid: string | null;
  parts: string[];
  depth: number;
  objectsByOid: Map<string, PackObjectInput>;
}): Promise<DeleteTreePathResult> {
  if (!args.currentTreeOid) {
    return {
      ok: false,
      reason: "not-found",
      detail: `Path '${args.parts.join("/")}' does not exist on this branch.`,
    };
  }

  const segment = args.parts[args.depth]!;
  const isLeaf = args.depth === args.parts.length - 1;
  const existingEntries = await readTree(args.env, args.doName, args.currentTreeOid, args.cacheCtx);
  const existing = existingEntries.find((entry) => entry.name === segment);

  if (!existing) {
    return {
      ok: false,
      reason: "not-found",
      detail: `Path '${args.parts.join("/")}' does not exist on this branch.`,
    };
  }

  let nextEntries: TreeEntry[];
  if (isLeaf) {
    if (existing.mode.startsWith("40000")) {
      return {
        ok: false,
        reason: "invalid-path",
        detail: `Cannot delete directory '${segment}' as a file.`,
      };
    }
    nextEntries = resolveDeleteTreeEntries(existingEntries, segment, null);
  } else {
    if (!existing.mode.startsWith("40000")) {
      return {
        ok: false,
        reason: "not-found",
        detail: `Path segment '${segment}' is not a directory.`,
      };
    }
    const childResult = await deleteTreePath({
      env: args.env,
      doName: args.doName,
      cacheCtx: args.cacheCtx,
      currentTreeOid: existing.oid,
      parts: args.parts,
      depth: args.depth + 1,
      objectsByOid: args.objectsByOid,
    });
    if (!childResult.ok) {
      return childResult;
    }
    nextEntries = resolveDeleteTreeEntries(existingEntries, segment, childResult.treeOid);
  }

  // Prune empty subdirectories (depth > 0); root (depth === 0) must still encode a valid empty tree.
  if (nextEntries.length === 0 && args.depth > 0) {
    return { ok: true, treeOid: null };
  }

  const payload = encodeTreePayload(nextEntries);
  const { oid } = await createGitObject("tree", payload);
  if (!args.objectsByOid.has(oid)) {
    args.objectsByOid.set(oid, { type: "tree", payload });
  }
  return { ok: true, treeOid: oid };
}

function formatDefaultCommitMessage(operation: TreeMutationOperation): string {
  if (operation.kind === "upsert") return `Update ${operation.filePath}`;
  if (operation.kind === "delete") return `Delete ${operation.filePath}`;
  return `Move ${operation.fromPath} to ${operation.toPath}`;
}

function collectAffectedDirs(operation: TreeMutationOperation): string[] {
  const dirs = new Set<string>();
  const addParent = (filePath: string) => {
    const parts = normalizeRepoFilePath(filePath);
    if (!parts) return;
    const parent = parts.slice(0, -1).join("/");
    if (parent) dirs.add(parent);
  };
  if (operation.kind === "move") {
    addParent(operation.fromPath);
    addParent(operation.toPath);
  } else {
    addParent(operation.filePath);
  }
  return Array.from(dirs);
}

/**
 * Commits a single file upsert, delete, or rename/move directly to a branch
 * through `beginReceive -> R2 pack/idx -> finalizeReceive`.
 */
export async function commitRepositoryMutation(
  input: CommitMutationInput
): Promise<CommitFileResult> {
  const op = input.operation;
  const freshCacheCtx: CacheContext = {
    req: input.cacheCtx.req,
    ctx: input.cacheCtx.ctx,
    memo: {
      repoId: input.doName,
      flags: new Set(["no-cache-read", "no-cache-write"]),
      limiter: input.limiter,
    },
  };

  let logPath: string;
  let primaryParts: string[] | null = null;
  let moveFromParts: string[] | null = null;
  let moveToParts: string[] | null = null;

  if (op.kind === "move") {
    moveFromParts = normalizeRepoFilePath(op.fromPath);
    moveToParts = normalizeRepoFilePath(op.toPath);
    if (!moveFromParts || !moveToParts) {
      return { ok: false, reason: "invalid-path" };
    }
    logPath = `${moveFromParts.join("/")} -> ${moveToParts.join("/")}`;
  } else {
    primaryParts = normalizeRepoFilePath(op.filePath);
    if (!primaryParts) {
      return { ok: false, reason: "invalid-path" };
    }
    logPath = primaryParts.join("/");
  }

  const stub = getRepoStub(input.env, input.doName);
  const headAndRefs = await input.limiter.run(
    "do:commit-head-refs",
    async () => await stub.getHeadAndRefs()
  );

  const requestedTarget = input.targetRef || headAndRefs.head.target || "refs/heads/main";
  const branchRef = resolveEditableBranchRef(requestedTarget, headAndRefs);
  if (!branchRef) {
    return {
      ok: false,
      reason: "invalid-ref",
      detail: "Web commits must target a valid branch ref.",
    };
  }

  const existingRef = headAndRefs.refs.find((ref) => ref.name === branchRef);
  const oldOid = existingRef?.oid || zeroOid();
  const hasParentCommit = oldOid !== zeroOid();

  let parentTreeOid: string | null = null;
  if (hasParentCommit) {
    const parentCommit = await readCommit(input.env, input.doName, oldOid, freshCacheCtx);
    parentTreeOid = parentCommit.tree;
  }

  const objectsByOid = new Map<string, PackObjectInput>();
  let newTreeOid: string;

  if (op.kind === "upsert") {
    const blobPayload = toBlobBytes(op.content);
    const { oid: blobOid } = await createGitObject("blob", blobPayload);
    objectsByOid.set(blobOid, { type: "blob", payload: blobPayload });

    const treeResult = await upsertTreePath({
      env: input.env,
      doName: input.doName,
      cacheCtx: freshCacheCtx,
      currentTreeOid: parentTreeOid,
      parts: primaryParts!,
      depth: 0,
      blobOid,
      objectsByOid,
    });
    if (!treeResult.ok) {
      input.log.warn("web-commit:invalid-tree-path", {
        repositoryId: input.repositoryId,
        path: logPath,
        detail: treeResult.detail,
      });
      return treeResult;
    }
    newTreeOid = treeResult.treeOid;
  } else if (op.kind === "delete") {
    const delResult = await deleteTreePath({
      env: input.env,
      doName: input.doName,
      cacheCtx: freshCacheCtx,
      currentTreeOid: parentTreeOid,
      parts: primaryParts!,
      depth: 0,
      objectsByOid,
    });
    if (!delResult.ok) {
      input.log.warn("web-commit:delete-tree-failed", {
        repositoryId: input.repositoryId,
        path: logPath,
        reason: delResult.reason,
        detail: delResult.detail,
      });
      return delResult;
    }
    if (!delResult.treeOid) {
      const payload = encodeTreePayload([]);
      const { oid } = await createGitObject("tree", payload);
      objectsByOid.set(oid, { type: "tree", payload });
      newTreeOid = oid;
    } else {
      newTreeOid = delResult.treeOid;
    }
  } else {
    const fromNormalized = moveFromParts!.join("/");
    const toNormalized = moveToParts!.join("/");
    if (fromNormalized === toNormalized && op.content === undefined) {
      return { ok: true, commitOid: oldOid, ref: branchRef, unchanged: true };
    }

    const sourceLookup = await readTreeEntryAtPath({
      env: input.env,
      doName: input.doName,
      cacheCtx: freshCacheCtx,
      rootTreeOid: parentTreeOid,
      parts: moveFromParts!,
    });
    if (!sourceLookup.ok) {
      return sourceLookup;
    }

    let targetBlobOid = sourceLookup.entry.oid;
    let targetMode: "100644" | "100755" | "120000" =
      sourceLookup.entry.mode === "100755"
        ? "100755"
        : sourceLookup.entry.mode === "120000"
          ? "120000"
          : "100644";

    if (op.content !== undefined) {
      const blobPayload = toBlobBytes(op.content);
      const { oid } = await createGitObject("blob", blobPayload);
      objectsByOid.set(oid, { type: "blob", payload: blobPayload });
      targetBlobOid = oid;
      if (targetMode === "120000") {
        targetMode = "100644";
      }
    }

    let intermediateTreeOid = parentTreeOid;
    if (fromNormalized !== toNormalized) {
      const delResult = await deleteTreePath({
        env: input.env,
        doName: input.doName,
        cacheCtx: freshCacheCtx,
        currentTreeOid: parentTreeOid,
        parts: moveFromParts!,
        depth: 0,
        objectsByOid,
      });
      if (!delResult.ok) {
        return delResult;
      }
      intermediateTreeOid = delResult.treeOid;
    }

    const upsertResult = await upsertTreePath({
      env: input.env,
      doName: input.doName,
      cacheCtx: freshCacheCtx,
      currentTreeOid: intermediateTreeOid,
      parts: moveToParts!,
      depth: 0,
      blobOid: targetBlobOid,
      explicitMode: targetMode,
      objectsByOid,
    });
    if (!upsertResult.ok) {
      input.log.warn("web-commit:move-upsert-failed", {
        repositoryId: input.repositoryId,
        path: logPath,
        detail: upsertResult.detail,
      });
      return upsertResult;
    }
    newTreeOid = upsertResult.treeOid;
  }

  if (parentTreeOid && newTreeOid === parentTreeOid) {
    input.log.info("web-commit:unchanged", {
      repositoryId: input.repositoryId,
      ref: branchRef,
      path: logPath,
    });
    return { ok: true, commitOid: oldOid, ref: branchRef, unchanged: true };
  }

  const now = Date.now();
  const timestampSec = Math.floor(now / 1000);
  const cleanName = sanitizeIdentPart(input.authorName, "Administrator");
  const cleanEmail = sanitizeIdentPart(input.authorEmail, "noreply@localhost");
  const ident = `${cleanName} <${cleanEmail}> ${timestampSec} +0000`;

  const message = input.commitMessage.trim()
    ? `${input.commitMessage.trim()}\n`
    : `${formatDefaultCommitMessage(op)}\n`;

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
      path: logPath,
    });
    return { ok: false, reason: "repo-busy" };
  }

  const token = leaseResult.lease.token;
  let stagedPackKey: string | undefined;
  try {
    const packData = await buildPackV2(Array.from(objectsByOid.values()));
    stagedPackKey = r2PackKey(
      doPrefix(stub.id.toString()),
      `pack-web-${now}-${crypto.randomUUID().slice(0, 8)}.pack`
    );

    await input.limiter.run("r2:commit-put-pack", () =>
      input.env.REPO_BUCKET.put(stagedPackKey!, packData)
    );

    const scanResult = await scanPack({
      env: input.env,
      packKey: stagedPackKey,
      packSize: packData.byteLength,
      limiter: input.limiter,
      countSubrequest: () => {},
      log: input.log,
    });

    const resolveResult = await resolveDeltasAndWriteIdx({
      env: input.env,
      packKey: stagedPackKey,
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
            packKey: stagedPackKey!,
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
      await cleanupFailedWebCommit({ input, stub, token, packKey: stagedPackKey });
      return {
        ok: false,
        reason: "commit-failed",
        detail: `Finalize status: ${finalized.status}`,
      };
    }

    if (finalized.shouldQueueCompaction && shouldAutoQueueBackgroundCompaction(input.env)) {
      const enqueueTask = sendOptionalMaintenanceTask({
        env: input.env,
        message: {
          kind: "compaction",
          doId: stub.id.toString(),
          repoId: input.doName,
        },
        log: input.log,
      }).catch((error) => {
        input.log.warn("web-commit:compaction-enqueue-failed", {
          repositoryId: input.repositoryId,
          error: String(error),
        });
      });
      if (input.cacheCtx.ctx) {
        input.cacheCtx.ctx.waitUntil(enqueueTask);
      } else {
        await enqueueTask;
      }
    }

    const prevRepo = await findRepositoryById(input.db, input.repositoryId);
    const prevVersion = prevRepo ? String(prevRepo.updatedAt) : undefined;
    const nextUpdatedAt = prevRepo ? Math.max(now, prevRepo.updatedAt + 1) : now;
    await touchRepositoryUpdatedAt(input.db, input.repositoryId, nextUpdatedAt);
    await deleteRepoBranchCacheRecord(input.env, input.repositoryId).catch(() => {});

    const shortBranch = shortRefName(branchRef);
    const affectedDirs = collectAffectedDirs(op);
    const versionsToPurge = Array.from(new Set<string | undefined>([prevVersion, undefined]));
    const refVariants = Array.from(
      new Set([shortBranch, branchRef, ...(hasParentCommit ? [oldOid] : []), commitOid])
    );
    const cacheDeletions: Promise<void>[] = [];
    for (const v of versionsToPurge) {
      cacheDeletions.push(
        cacheDeleteJSON(
          buildCacheKeyFrom(input.cacheCtx.req, "/_cache/refs", { repo: input.doName, v })
        )
      );
      for (const refKey of refVariants) {
        cacheDeletions.push(
          cacheDeleteJSON(
            buildCacheKeyFrom(input.cacheCtx.req, "/_cache/readme", {
              repo: input.doName,
              ref: refKey,
              v,
            })
          ),
          cacheDeleteJSON(
            buildCacheKeyFrom(input.cacheCtx.req, "/_cache/owner-profile-readme", {
              repo: input.doName,
              ref: refKey,
              v,
            })
          ),
          cacheDeleteJSON(
            buildCacheKeyFrom(input.cacheCtx.req, "/_cache/tree", {
              repo: input.doName,
              ref: refKey,
              path: "",
              v,
            })
          ),
          cacheDeleteJSON(
            buildCacheKeyFrom(input.cacheCtx.req, "/_cache/commits", {
              repo: input.doName,
              ref: refKey,
              per_page: "25",
              page: "0",
              offset: "0",
              v,
            })
          )
        );
        for (const parentDir of affectedDirs) {
          cacheDeletions.push(
            cacheDeleteJSON(
              buildCacheKeyFrom(input.cacheCtx.req, "/_cache/tree", {
                repo: input.doName,
                ref: refKey,
                path: parentDir,
                v,
              })
            )
          );
        }
      }
    }
    await Promise.all(cacheDeletions);
    input.log.info("web-commit:ok", {
      repositoryId: input.repositoryId,
      kind: op.kind,
      commitOid,
      ref: branchRef,
      path: logPath,
      objects: resolveResult.objectCount,
    });

    return { ok: true, commitOid, ref: branchRef, unchanged: false };
  } catch (error) {
    input.log.warn("web-commit:failed", {
      repositoryId: input.repositoryId,
      kind: op.kind,
      path: logPath,
      error: String(error),
    });
    await cleanupFailedWebCommit({ input, stub, token, packKey: stagedPackKey });
    return { ok: false, reason: "commit-failed", detail: String(error) };
  }
}

export async function commitRepositoryFile(input: CommitFileInput): Promise<CommitFileResult> {
  return await commitRepositoryMutation({
    env: input.env,
    db: input.db,
    limiter: input.limiter,
    log: input.log,
    cacheCtx: input.cacheCtx,
    repositoryId: input.repositoryId,
    doName: input.doName,
    operation: {
      kind: "upsert",
      filePath: input.filePath,
      content: input.content,
    },
    commitMessage: input.commitMessage,
    authorName: input.authorName,
    authorEmail: input.authorEmail,
    targetRef: input.targetRef,
  });
}
