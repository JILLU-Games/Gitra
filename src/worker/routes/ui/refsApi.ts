import type { Ref } from "@/worker/git";
import { getErrorMessage } from "@/client/server/error";
import { classifyRef, formatRefOption } from "@/shared/git/ref-display";
import { findRepositoryById } from "@/worker/db/d1/dal/repositories";
import { isRequestPrivate, loadHeadAndRefsCached, resolveUiRepoAccess } from "./helpers";
import type { AppContext } from "../hono";

export async function handleRefsApi(c: AppContext<"/:owner/:repo/api/refs">) {
  const env = c.env;
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const access = await resolveUiRepoAccess(c, owner, repo, { responseShape: "json" });
  if (access.kind === "response") return access.response;
  const { route, cacheCtx } = access;
  try {
    const repoRow = await findRepositoryById(c.var.db, route.repositoryId);
    const refsData = await loadHeadAndRefsCached(
      env,
      cacheCtx,
      route.doName,
      repoRow ? String(repoRow.updatedAt) : undefined
    );
    const refs: Ref[] = refsData?.refs || [];
    const branches = refs.filter((ref) => classifyRef(ref.name) === "branch").map(formatRefOption);
    const tags = refs.filter((ref) => classifyRef(ref.name) === "tag").map(formatRefOption);
    const isPrivate = isRequestPrivate(cacheCtx);
    return new Response(JSON.stringify({ branches, tags }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": isPrivate ? "no-store" : "public, max-age=60",
      },
    });
  } catch (e) {
    const log = c.var.logFor({ service: "UiRefsApi", repoId: route.doName });
    log.warn("refs-api:load-failed", { error: getErrorMessage(e) });
    const debug = String(env.LOG_LEVEL || "").toLowerCase() === "debug";
    return new Response(
      JSON.stringify({
        branches: [],
        tags: [],
        error: debug ? getErrorMessage(e) : "Failed to load repository refs",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
