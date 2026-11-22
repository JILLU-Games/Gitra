import { readBlobStream, readPath } from "@/worker/git";
import { getErrorMessage, isGitReadMissError, resolveErrorStatus } from "@/client/server/error";
import { isValidRef, isValidPath, OID_RE, getContentTypeFromName, isHttpError } from "@/shared/web";
import { isRequestPrivate, resolveUiRepoAccess } from "./helpers";
import type { AppContext } from "../hono";

export async function handleRaw(c: AppContext<"/:owner/:repo/raw">) {
  const env = c.env;
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const access = await resolveUiRepoAccess(c, owner, repo);
  if (access.kind === "response") return access.response;
  const { route, cacheCtx } = access;
  const isPrivate = isRequestPrivate(cacheCtx);
  const url = new URL(c.req.url);
  const oid = url.searchParams.get("oid") || "";
  if (!OID_RE.test(oid)) return new Response("Bad Request\n", { status: 400 });
  const fileName = url.searchParams.get("name") || oid;
  const download = url.searchParams.get("download") === "1";

  if (!oid) return new Response("Missing oid\n", { status: 400 });

  // This route still avoids whole-pack buffering, but a packed blob may be
  // materialized before the response body is streamed to the client.
  const streamResponse = await readBlobStream(env, route.doName, oid, cacheCtx);
  if (!streamResponse) return new Response("Not found\n", { status: 404 });

  // Use text/plain for all files (like GitHub's raw view) to prevent
  // browsers from executing HTML/JS and ensure consistent display.
  const headers = new Headers(streamResponse.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  if (isPrivate) headers.set("Cache-Control", "no-store");

  if (download) {
    headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
  } else {
    headers.set("Content-Disposition", `inline; filename="${fileName}"`);
  }

  return new Response(streamResponse.body, {
    status: streamResponse.status,
    headers,
  });
}

export async function handleRawPath(c: AppContext<"/:owner/:repo/rawpath">) {
  const env = c.env;
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const access = await resolveUiRepoAccess(c, owner, repo);
  if (access.kind === "response") return access.response;
  const { route, cacheCtx } = access;
  const isPrivate = isRequestPrivate(cacheCtx);
  const url = new URL(c.req.url);
  const ref = url.searchParams.get("ref") || "main";
  const path = url.searchParams.get("path") || "";
  const name = url.searchParams.get("name") || path.split("/").pop() || "file";
  const download = url.searchParams.get("download") === "1";
  if (!isValidRef(ref) || !isValidPath(path)) {
    return new Response("Bad Request\n", { status: 400 });
  }

  // Basic hotlink protection: require same-origin Referer
  const referer = c.req.raw.headers.get("referer") || "";
  let allowedReferer = false;
  if (referer) {
    try {
      allowedReferer = new URL(referer).host === url.host;
    } catch {
      allowedReferer = false;
    }
  }
  if (!allowedReferer) {
    return new Response("Hotlinking not allowed\n", { status: 403 });
  }

  const rawLog = c.var.logFor({ service: "RawUi", repoId: route.doName });
  try {
    const repoId = route.doName;
    const result = await readPath(env, repoId, ref, path, cacheCtx);
    if (result.type !== "blob") return new Response("Not a blob\n", { status: 400 });
    const streamResponse = await readBlobStream(env, repoId, result.oid, cacheCtx);
    if (!streamResponse) return new Response("Not found\n", { status: 404 });

    const headers = new Headers(streamResponse.headers);
    headers.set("Content-Type", getContentTypeFromName(name));
    if (isPrivate) headers.set("Cache-Control", "no-store");
    if (download) headers.set("Content-Disposition", `attachment; filename="${name}"`);
    else headers.set("Content-Disposition", `inline; filename="${name}"`);
    return new Response(streamResponse.body, { status: streamResponse.status, headers });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (isGitReadMissError(error)) {
      rawLog.debug("rawpath:read-miss", { ref, path });
      return new Response("Not found\n", { status: 404 });
    }
    if (isHttpError(error)) {
      rawLog.warn("rawpath:http-error", { status: error.status, ref, path, error: errorMessage });
      return new Response(error.expose ? `${errorMessage}\n` : "Error\n", { status: error.status });
    }
    const status = resolveErrorStatus(error);
    rawLog.warn("rawpath:read-failed", { status, ref, path, error: errorMessage });
    return new Response(status === 404 ? "Not found\n" : "Internal Server Error\n", { status });
  }
}
