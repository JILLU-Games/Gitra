import { readPath, type ReadPathResult } from "@/worker/git";
import { isValidRef, isValidPath, OID_RE } from "@/shared/web";
import { getErrorMessage, handleError, isGitReadMissError } from "@/client/server/error";
import { buildCacheKeyFrom, cacheOrLoadJSONForRequestWithTTL } from "@/worker/cache";
import { findRepositoryById } from "@/worker/db/d1/dal/repositories";
import {
  badRequest,
  canViewerManageRepo,
  isRequestPrivate,
  loadUiRepoActivity,
  markRequestPrivate,
  resolveUiRepoAccess,
  type UiTreeEntry,
  formatSortedTreeEntries,
} from "./helpers";
import { renderBlobDocumentResponse } from "./blob";
import type { AppContext } from "../hono";
import { renderUiDocumentResponse } from "../uiResponse";

type TreeCacheValue = Extract<ReadPathResult, { type: "tree" }> | { type: "blob-ref" };

export async function handleTree(c: AppContext<"/:owner/:repo/tree">) {
  const env = c.env;
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const access = await resolveUiRepoAccess(c, owner, repo);
  if (access.kind === "response") return access.response;
  const { route, cacheCtx } = access;
  const canManageRepo = canViewerManageRepo(access);
  if (canManageRepo) {
    markRequestPrivate(cacheCtx);
  }
  const repoId = route.doName;
  const isPrivate = isRequestPrivate(cacheCtx);
  const u = new URL(c.req.url);
  const ref = u.searchParams.get("ref") || "main";
  const path = u.searchParams.get("path") || "";
  if (!isValidRef(ref)) {
    return badRequest(env, "Invalid ref", "Ref format not allowed", {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
      path,
      viewer: access.viewer,
    });
  }
  if (path && !isValidPath(path)) {
    return badRequest(env, "Invalid path", "Path contains invalid characters or is too long", {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
      path,
      viewer: access.viewer,
    });
  }

  const treeLog = c.var.logFor({ service: "UiTree", repoId });
  const liveBlobRef: { current: Extract<ReadPathResult, { type: "blob" }> | null } = {
    current: null,
  };

  const loadTree = async (): Promise<TreeCacheValue | null> => {
    try {
      const resolved = await readPath(env, repoId, ref, path, cacheCtx);
      if (resolved.type === "blob") {
        // Keep raw Uint8Array bytes out of the JSON cache; renderBlobDocumentResponse
        // needs an intact byte buffer to detect binary/media files accurately.
        liveBlobRef.current = resolved;
        return { type: "blob-ref" };
      }
      return resolved;
    } catch (error) {
      if (isGitReadMissError(error)) {
        treeLog.debug("tree:read-path-miss", { ref, path });
        return null;
      }
      treeLog.warn("tree:read-path-failed", { ref, path, error: getErrorMessage(error) });
      throw error;
    }
  };
  const repoRow = await findRepositoryById(c.var.db, route.repositoryId);
  const cacheVersion = OID_RE.test(ref)
    ? undefined
    : repoRow
      ? String(repoRow.updatedAt)
      : undefined;
  const cacheKeyTree = buildCacheKeyFrom(c.req.raw, "/_cache/tree", {
    repo: repoId,
    ref,
    path,
    v: cacheVersion,
  });

  try {
    const result = await cacheOrLoadJSONForRequestWithTTL<TreeCacheValue | null>(
      cacheCtx,
      cacheKeyTree,
      loadTree,
      (value) => (value && value.type === "tree" ? 60 : 300)
    );

    // Handle missing tree/blob result gracefully (path not found inside an
    // existing repo). Repo-not-found is already handled by `resolveUiRepoAccess`
    // upstream.
    if (!result) {
      return await renderUiDocumentResponse(
        env,
        "error",
        {
          title: `${owner}/${repo} · Tree`,
          message: "Not found",
          owner,
          repo,
          refEnc: encodeURIComponent(ref),
          path,
        },
        {
          status: 404,
          cacheControl: isPrivate ? "no-store" : "no-store, no-cache, must-revalidate",
          failureBody: "Not found\n",
          failureStatus: 404,
          viewer: access.viewer,
        }
      );
    }
    if (result.type === "tree") {
      const entries: UiTreeEntry[] = result.entries
        ? formatSortedTreeEntries({
            owner,
            repo,
            ref,
            basePath: path,
            entries: result.entries,
          })
        : [];
      // Generate breadcrumbs and parent link
      const parts = (path || "").split("/").filter(Boolean);
      // Truncate ref if too long (e.g., commit hashes)
      const refDisplay = ref.length > 20 ? ref.slice(0, 7) + "..." : ref;
      const breadcrumbs = [
        {
          name: refDisplay,
          href: parts.length > 0 ? `/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}` : null,
        },
        ...parts.map((part, i) => {
          const subPath = parts.slice(0, i + 1).join("/");
          const isLast = i === parts.length - 1;
          return {
            name: part,
            href: isLast
              ? null
              : `/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(subPath)}`,
          };
        }),
      ];
      const parentHref =
        parts.length > 0
          ? `/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(parts.slice(0, -1).join("/"))}`
          : null;
      const progress = await loadUiRepoActivity(env, access);
      const viewer = access.viewer;
      return renderUiDocumentResponse(
        env,
        "tree",
        {
          title: `${path || "root"} · ${owner}/${repo}`,
          owner,
          repo,
          visibility: route.visibility,
          canManageRepo,
          refEnc: encodeURIComponent(ref),
          progress,
          breadcrumbs,
          parentHref,
          entries,
        },
        {
          cacheControl: isPrivate ? "no-store" : undefined,
          failureBody: "Failed to render view",
          viewer,
        }
      );
    }

    let blobResult = liveBlobRef.current;
    if (!blobResult) {
      const liveRead = await readPath(env, repoId, ref, path, cacheCtx);
      if (liveRead.type !== "blob") {
        return new Response("Not a blob\n", { status: 400 });
      }
      blobResult = liveRead;
    }
    const progress = await loadUiRepoActivity(env, access);
    return await renderBlobDocumentResponse(c, {
      access,
      owner,
      repo,
      ref,
      path,
      result: blobResult,
      progress,
    });
  } catch (e) {
    return handleError(env, e, `${owner}/${repo} · Tree`, {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
      path,
      viewer: access.viewer,
    });
  }
}
