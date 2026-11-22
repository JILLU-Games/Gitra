import { readPath } from "@/worker/git";
import { isValidRef, isValidPath, bytesToText, getHighlightLangsForBlobSmart } from "@/shared/web";
import { renderUiView } from "@/client/server/render";
import { getErrorMessage, handleError, isGitReadMissError } from "@/client/server/error";
import { buildCacheKeyFrom, cacheOrLoadJSONForRequestWithTTL } from "@/worker/cache";
import {
  badRequest,
  canViewerManageRepo,
  formatSortedTreeEntries,
  isRequestPrivate,
  loadUiRepoActivity,
  markRequestPrivate,
  resolveUiRepoAccess,
  type UiTreeEntry,
} from "./helpers";
import type { AppContext } from "../hono";
import { renderUiDocumentResponse } from "../uiResponse";
import type { ReadPathResult } from "@/worker/git";

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
    });
  }
  if (path && !isValidPath(path)) {
    return badRequest(env, "Invalid path", "Path contains invalid characters or is too long", {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
      path,
    });
  }

  const treeLog = c.var.logFor({ service: "UiTree", repoId });
  const loadTree = async (): Promise<ReadPathResult | null> => {
    try {
      return await readPath(env, repoId, ref, path, cacheCtx);
    } catch (error) {
      if (isGitReadMissError(error)) {
        treeLog.debug("tree:read-path-miss", { ref, path });
        return null;
      }
      treeLog.warn("tree:read-path-failed", { ref, path, error: getErrorMessage(error) });
      throw error;
    }
  };
  const cacheKeyTree = buildCacheKeyFrom(c.req.raw, "/_cache/tree", {
    repo: repoId,
    ref,
    path,
  });

  try {
    const result = await cacheOrLoadJSONForRequestWithTTL<ReadPathResult | null>(
      cacheCtx,
      cacheKeyTree,
      loadTree,
      (value) => (value && value.type === "tree" ? 60 : 300)
    );

    // Handle missing tree/blob result gracefully (path not found inside an
    // existing repo). Repo-not-found is already handled by `resolveUiRepoAccess`
    // upstream.
    if (!result) {
      try {
        const errHtml = await renderUiView(
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
          { viewer: access.viewer }
        );
        if (errHtml) {
          return new Response(errHtml, {
            status: 404,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": isPrivate ? "no-store" : "no-store, no-cache, must-revalidate",
            },
          });
        }
      } catch (renderError) {
        treeLog.warn("tree:not-found-render-failed", {
          ref,
          path,
          error: getErrorMessage(renderError),
        });
      }
      return new Response("Not found\n", { status: 404 });
    }
    if (result.type === "tree") {
      const entries: UiTreeEntry[] =
        result.type === "tree" && result.entries
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
    } else {
      const raw = `/${owner}/${repo}/raw?oid=${encodeURIComponent(result.oid)}`;
      const text = bytesToText(result.content);
      const lineCount = text === "" ? 0 : text.split(/\r?\n/).length;
      const title = path || result.oid;
      const langs = getHighlightLangsForBlobSmart(title, text);
      const codeLang = langs[0] || null;
      const progress = await loadUiRepoActivity(env, access);
      const viewer = access.viewer;
      return renderUiDocumentResponse(
        env,
        "blob",
        {
          title: `${title} · ${owner}/${repo}`,
          owner,
          repo,
          visibility: route.visibility,
          canManageRepo,
          refEnc: encodeURIComponent(ref),
          progress,
          fileName: title,
          viewRawHref: `/${owner}/${repo}/raw?oid=${encodeURIComponent(result.oid)}&view=1&name=${encodeURIComponent(title)}`,
          rawHref: raw,
          codeText: text,
          codeLang,
          lineCount,
        },
        {
          cacheControl: isPrivate ? "no-store" : undefined,
          failureBody: "Failed to render view",
          viewer,
        }
      );
    }
  } catch (e) {
    return handleError(env, e, `${owner}/${repo} · Tree`, {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
      path,
    });
  }
}
