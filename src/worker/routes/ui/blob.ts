import type { ReadPathResult } from "@/worker/git";
import { canWriteRepositories } from "@/shared/admin/panel";
import { getHeadAndRefs, readPath } from "@/worker/git";
import {
  isValidRef,
  isValidPath,
  formatSize,
  detectBinary,
  bytesToText,
  getHighlightLangsForBlobSmart,
  OID_RE,
} from "@/shared/web";
import { handleError } from "@/client/server/error";
import {
  badRequest,
  canViewerManageRepo,
  isRequestPrivate,
  loadUiRepoActivity,
  markRequestPrivate,
  resolveUiRepoAccess,
  type UiRepoAccess,
} from "./helpers";
import type { AppContext } from "../hono";
import { renderUiDocumentResponse } from "../uiResponse";

type BlobReadResult = Extract<ReadPathResult, { type: "blob" }>;

export async function renderBlobDocumentResponse(
  c: AppContext,
  args: {
    access: Extract<UiRepoAccess, { kind: "ok" }>;
    owner: string;
    repo: string;
    ref: string;
    path: string;
    result: BlobReadResult;
    progress?: unknown;
  }
): Promise<Response> {
  const { access, owner, repo, ref, path, result, progress } = args;
  const env = c.env;
  const { route, cacheCtx, viewer } = access;
  const repoId = route.doName;
  const canManageRepo = canViewerManageRepo(access);
  const fileName = path || result.oid;

  // Generate breadcrumbs and parent link
  const parts = (path || "").split("/").filter(Boolean);
  const refDisplay = ref.length > 20 ? ref.slice(0, 7) + "..." : ref;
  const breadcrumbs = [
    {
      name: refDisplay,
      href: parts.length > 0 ? `/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}` : null,
    },
    ...parts.map((part: string, i: number) => {
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
    parts.length > 1
      ? `/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(parts.slice(0, -1).join("/"))}`
      : parts.length === 1
        ? `/${owner}/${repo}/tree?ref=${encodeURIComponent(ref)}`
        : null;

  // Too large to render inline
  if (result.tooLarge) {
    const isPrivate = isRequestPrivate(cacheCtx);
    const sizeStr = formatSize(result.size || 0);
    const viewRawHref = `/${owner}/${repo}/raw?oid=${encodeURIComponent(result.oid)}&view=1&name=${encodeURIComponent(fileName)}`;
    const rawHref = `/${owner}/${repo}/raw?oid=${encodeURIComponent(result.oid)}&download=1&name=${encodeURIComponent(fileName)}`;
    return renderUiDocumentResponse(
      env,
      "blob",
      {
        title: `${fileName} · ${owner}/${repo}`,
        owner,
        repo,
        visibility: route.visibility,
        canManageRepo,
        repositoryId: route.repositoryId,
        filePath: path,
        refShort: ref,
        refEnc: encodeURIComponent(ref),
        progress,
        fileName,
        tooLarge: true,
        canEditFile: false,
        canMutateFile: Boolean(
          viewer &&
          canWriteRepositories(viewer.role) &&
          access.showActivityBanner &&
          Boolean(path) &&
          !OID_RE.test(ref) &&
          !(ref.startsWith("refs/") && !ref.startsWith("refs/heads/"))
        ),
        sizeStr,
        viewRawHref,
        rawHref,
        breadcrumbs,
        parentHref,
      },
      {
        cacheControl: isPrivate ? "no-store" : undefined,
        failureBody: "Failed to render view",
        viewer,
      }
    );
  }

  // Binary vs text
  const isBinary = detectBinary(result.content);
  const isCommitSha = OID_RE.test(ref);
  const hasNonBranchPrefix = ref.startsWith("refs/") && !ref.startsWith("refs/heads/");
  const mayMutateCandidate = Boolean(
    viewer &&
    canWriteRepositories(viewer.role) &&
    access.showActivityBanner &&
    Boolean(path) &&
    !isCommitSha &&
    !hasNonBranchPrefix
  );
  let canMutateFile = false;
  if (mayMutateCandidate) {
    const { head, refs } = await getHeadAndRefs(env, repoId, cacheCtx);
    if (ref === "HEAD") {
      canMutateFile = Boolean(head?.target?.startsWith("refs/heads/"));
    } else if (ref.startsWith("refs/heads/")) {
      canMutateFile = true;
    } else {
      const hasBranch = refs.some((entry) => entry.name === `refs/heads/${ref}`);
      const hasTag = refs.some((entry) => entry.name === `refs/tags/${ref}`);
      canMutateFile = hasBranch || !hasTag;
    }
  }
  const canEditFile = canMutateFile && !isBinary;
  if (canMutateFile) {
    markRequestPrivate(cacheCtx);
  }
  const isPrivate = isRequestPrivate(cacheCtx);

  const size = result.content.byteLength;
  const viewRawHref = `/${owner}/${repo}/raw?oid=${encodeURIComponent(result.oid)}&view=1&name=${encodeURIComponent(fileName)}`;
  const rawHref = `/${owner}/${repo}/raw?oid=${encodeURIComponent(result.oid)}&download=1&name=${encodeURIComponent(fileName)}`;
  const templateData: Record<string, unknown> = {
    title: `${fileName} · ${owner}/${repo}`,
    owner,
    repo,
    visibility: route.visibility,
    canManageRepo,
    repositoryId: route.repositoryId,
    filePath: path,
    refShort: ref,
    refEnc: encodeURIComponent(ref),
    progress,
    fileName,
    canEditFile,
    canMutateFile,
    viewRawHref,
    breadcrumbs,
    parentHref,
    rawHref,
  };

  if (isBinary) {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"].includes(ext);
    const isPdf = ext === "pdf";
    if ((isImage || isPdf) && path) {
      const name = encodeURIComponent(fileName);
      const mediaSrc = `/${owner}/${repo}/rawpath?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}&name=${name}`;
      templateData.isImage = isImage;
      templateData.isPdf = isPdf;
      templateData.mediaSrc = mediaSrc;
      templateData.sizeStr = formatSize(size);
    } else {
      templateData.isBinary = true;
      templateData.sizeStr = formatSize(size);
    }
  } else {
    const text = bytesToText(result.content);
    const lineCount = text === "" ? 0 : text.split(/\r?\n/).length;
    const isMd =
      fileName.toLowerCase().endsWith(".md") || fileName.toLowerCase().endsWith(".markdown");
    if (isMd) {
      const baseDir = (path || "").split("/").filter(Boolean).slice(0, -1).join("/");
      templateData.isMarkdown = true;
      templateData.markdownRaw = text;
      templateData.lineCount = lineCount;
      templateData.mdOwner = owner;
      templateData.mdRepo = repo;
      templateData.mdRef = ref;
      templateData.mdBase = baseDir;
    } else {
      const langs = getHighlightLangsForBlobSmart(fileName, text);
      const codeLang = langs[0] || null;
      templateData.codeText = text;
      templateData.codeLang = codeLang;
      templateData.lineCount = lineCount;
      if (!codeLang) {
        templateData.sizeStr = formatSize(size);
      }
    }
  }

  return renderUiDocumentResponse(env, "blob", templateData, {
    cacheControl: isPrivate ? "no-store" : undefined,
    failureBody: "Failed to render view",
    viewer,
  });
}

export async function handleBlob(c: AppContext<"/:owner/:repo/blob">) {
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
  try {
    const result = await readPath(env, repoId, ref, path, cacheCtx);
    if (result.type !== "blob") return new Response("Not a blob\n", { status: 400 });
    const progress = await loadUiRepoActivity(env, access);
    return await renderBlobDocumentResponse(c, {
      access,
      owner,
      repo,
      ref,
      path,
      result,
      progress,
    });
  } catch (e) {
    return handleError(env, e, `Error · ${owner}/${repo}`, {
      owner,
      repo,
      refEnc: encodeURIComponent(ref),
      path,
      viewer: access.viewer,
    });
  }
}
