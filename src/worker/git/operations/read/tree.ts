import type { CacheContext } from "@/worker/cache";
import type { TreeEntry } from "./types";
import { readLooseObjectRaw, parseTree } from "./objects";
import { resolveRef } from "./refs";
import { readCommit } from "./commits";
import { parseTagTarget } from "@/worker/git/core";

export async function readTree(
  env: Env,
  repoId: string,
  oid: string,
  cacheCtx?: CacheContext
): Promise<TreeEntry[]> {
  const obj = await readLooseObjectRaw(env, repoId, oid, cacheCtx);
  if (!obj || obj.type !== "tree") {
    throw new Error("Not a tree");
  }
  return parseTree(obj.payload);
}

export async function readPath(
  env: Env,
  repoId: string,
  ref: string,
  path?: string,
  cacheCtx?: CacheContext
): Promise<ReadPathResult> {
  let startOid: string | undefined = await resolveRef(env, repoId, ref);
  if (!startOid && /^[0-9a-f]{40}$/i.test(ref)) startOid = ref.toLowerCase();
  if (!startOid) throw new Error("Ref not found");

  const startObj = await readLooseObjectRaw(env, repoId, startOid, cacheCtx);
  if (!startObj) throw new Error("Object not found");

  const MAX_TAG_DEPTH = 8;
  let currentOid = startOid;
  let currentObj = startObj;
  let tagHops = 0;
  while (currentObj.type === "tag") {
    if (tagHops >= MAX_TAG_DEPTH) {
      throw new Error("Tag chain exceeded max depth");
    }
    const t = parseTagTarget(currentObj.payload);
    if (!t || !t.targetOid) throw new Error("Unsupported object type");
    currentOid = t.targetOid;
    const nextObj = await readLooseObjectRaw(env, repoId, currentOid, cacheCtx);
    if (!nextObj) throw new Error("Object not found");
    currentObj = nextObj;
    tagHops++;
  }

  let currentTreeOid: string | undefined;
  if (currentObj.type === "commit") {
    const { tree } = await readCommit(env, repoId, currentOid, cacheCtx);
    currentTreeOid = tree;
  } else if (currentObj.type === "tree") {
    currentTreeOid = currentOid;
  } else if (currentObj.type === "blob") {
    if (path && path !== "") throw new Error("Path not a directory");
    const MAX_SIZE = 5 * 1024 * 1024;
    const actualSize = currentObj.payload.byteLength;
    if (actualSize > MAX_SIZE) {
      return {
        type: "blob",
        oid: currentOid,
        content: new Uint8Array(0),
        base: "",
        size: actualSize,
        tooLarge: true,
      };
    }
    return { type: "blob", oid: currentOid, content: currentObj.payload, base: "" };
  } else {
    throw new Error("Unsupported object type");
  }

  const parts = (path || "").split("/").filter(Boolean);
  let base = "";
  for (let i = 0; i < parts.length; i++) {
    const entries = await readTree(env, repoId, currentTreeOid, cacheCtx);
    const ent = entries.find((e) => e.name === parts[i]);
    if (!ent) throw new Error("Path not found");
    base = parts.slice(0, i + 1).join("/");
    if (ent.mode.startsWith("40000")) {
      currentTreeOid = ent.oid;
      if (i === parts.length - 1) {
        const finalEntries = await readTree(env, repoId, currentTreeOid, cacheCtx);
        return { type: "tree", entries: finalEntries, base };
      }
    } else {
      if (i !== parts.length - 1) throw new Error("Path not a directory");
      const MAX_SIZE = 5 * 1024 * 1024;
      const blob = await readLooseObjectRaw(env, repoId, ent.oid, cacheCtx);
      if (!blob || blob.type !== "blob") throw new Error("Not a blob");

      // Pack reads are authoritative here, so the UI size gate must be based
      // on the resolved blob payload instead of legacy loose-object metadata.
      const actualSize = blob.payload.byteLength;
      if (actualSize > MAX_SIZE) {
        return {
          type: "blob",
          oid: ent.oid,
          content: new Uint8Array(0),
          base,
          size: actualSize,
          tooLarge: true,
        };
      }

      return { type: "blob", oid: ent.oid, content: blob.payload, base };
    }
  }
  const rootEntries = await readTree(env, repoId, currentTreeOid, cacheCtx);
  return { type: "tree", entries: rootEntries, base };
}

export type ReadPathResult =
  | { type: "tree"; entries: TreeEntry[]; base: string }
  | {
      type: "blob";
      oid: string;
      content: Uint8Array;
      base: string;
      size?: number;
      tooLarge?: boolean;
    };

export function isTreeMode(mode: string): boolean {
  return mode.startsWith("40000");
}

export function isSymlinkMode(mode: string): boolean {
  return mode === "120000";
}

export function joinTreePath(basePath: string, name: string): string {
  return basePath ? `${basePath}/${name}` : name;
}
