import { getRepoStub, isValidOid, json } from "@/worker/common";
import { buildCacheKeyFrom, cacheDeleteJSON } from "@/worker/cache";
import { sameOriginViolation } from "@/worker/auth/origin";
import { findRepositoryById, touchRepositoryUpdatedAt } from "@/worker/db/d1/dal";
import { type RepositoryRoute } from "@/worker/repositories/route";
import { deleteRepoBranchCacheRecord } from "@/worker/repositories/routeCache";
import { safeParseJsonRequest } from "@/shared/web";
import type { RepositoryDeleteMessage } from "@/worker/tasks/queue";
import { dispatchRepositoryDelete, sendOptionalMaintenanceTask } from "@/worker/tasks/dispatch";
import { resolveAdminApiRepoAccess, type AdminRepoAccess } from "./ui/helpers";
import { workerExecutionContext, type AppContext, type AppRouter } from "./hono";
import {
  AdminCompactionRequestSchema,
  AdminHeadPayloadSchema,
  AdminPurgeRequestSchema,
  AdminRefsPayloadSchema,
} from "./requestSchemas";

// Centralizes the auth + non-disclosure + CSRF policy for repo-scoped admin
// endpoints. Git credentials are deliberately ignored: admin is
// browser-session-only.
async function requireRepoAdmin(c: AppContext): Promise<AdminRepoAccess> {
  // CSRF check first so a missing/cross-origin mutating request fails before
  // we read D1. `sameOriginViolation` short-circuits safe methods (GET, HEAD,
  // OPTIONS), so debug/list endpoints stay reachable from background tabs.
  const violation = sameOriginViolation(c);
  if (violation) {
    return { kind: "response", response: violation };
  }
  return await resolveAdminApiRepoAccess(c);
}

async function invalidateRepoRefsAndBranchCache(
  c: AppContext,
  route: RepositoryRoute
): Promise<void> {
  const prevRepo = await findRepositoryById(c.var.db, route.repositoryId);
  const prevVersion = prevRepo ? String(prevRepo.updatedAt) : undefined;
  const nextUpdatedAt = prevRepo ? Math.max(Date.now(), prevRepo.updatedAt + 1) : Date.now();
  await touchRepositoryUpdatedAt(c.var.db, route.repositoryId, nextUpdatedAt);
  await deleteRepoBranchCacheRecord(c.env, route.repositoryId);
  const versionsToPurge = Array.from(new Set<string | undefined>([prevVersion, undefined]));
  await Promise.all(
    versionsToPurge.map((v) =>
      cacheDeleteJSON(buildCacheKeyFrom(c.req.raw, "/_cache/refs", { repo: route.doName, v }))
    )
  );
}

export function registerAdminRoutes(router: AppRouter) {
  async function handleCompactionPost(c: AppContext<"/:owner/:repo/admin/compact">) {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const env = c.env;
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsedBody = AdminCompactionRequestSchema.safeParse(rawBody);
    const body = parsedBody.success ? parsedBody.data : { dryRun: undefined };
    const dryRun = body.dryRun !== false;
    const stub = getRepoStub(env, route.doName);
    const log = c.var.logFor({
      service: "AdminRoutes",
      repoId: route.doName,
    });
    try {
      const res = dryRun
        ? await limiter.run("do:admin-preview-compaction", () => stub.previewCompaction())
        : await limiter.run("do:admin-request-compaction", () => stub.requestCompaction());
      if (!dryRun && res.status === "queued" && res.shouldEnqueue) {
        const queueTask = sendOptionalMaintenanceTask({
          env,
          message: {
            kind: "compaction",
            doId: stub.id.toString(),
            repoId: route.doName,
          },
          log,
        })
          .then((sent) => {
            if (sent) {
              log.info("admin:compaction-enqueue-requested", {
                doId: stub.id.toString(),
              });
            }
          })
          .catch((error) => {
            log.warn("admin:compaction-enqueue-failed", {
              doId: stub.id.toString(),
              error: String(error),
            });
          });
        c.executionCtx.waitUntil(queueTask);
      }

      const status = dryRun || res.status !== "queued" ? 200 : 202;
      return json(res, status, { "Cache-Control": "no-cache" });
    } catch (e) {
      log.warn("admin:compaction-post-failed", { dryRun, error: String(e) });
      return json({ error: "Failed to process compaction request" }, 500);
    }
  }

  async function handleCompactionDelete(c: AppContext<"/:owner/:repo/admin/compact">) {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const res = await limiter.run("do:admin-clear-compaction", () =>
        stub.clearCompactionRequest()
      );
      return json({ ok: true, ...res }, 200, { "Cache-Control": "no-cache" });
    } catch (e) {
      log.warn("admin:compaction-clear-failed", { error: String(e) });
      return json({ ok: false, error: "Failed to clear compaction request" }, 500);
    }
  }

  router.delete(`/:owner/:repo/admin/compact`, handleCompactionDelete);
  router.post(`/:owner/:repo/admin/compact`, handleCompactionPost);

  // -------------------------------------------------------------------------
  // Repo-scoped admin endpoints. Auth model: admin session + namespace
  // membership, plus same-origin for mutating verbs (`requireRepoAdmin`
  // calls `sameOriginViolation` itself). Git credentials must NOT authorize
  // these routes.

  router.get(`/:owner/:repo/admin/refs`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const refs = await limiter.run("do:admin-list-refs", () => stub.listRefs());
      return json(refs);
    } catch (e) {
      log.warn("admin:list-refs-failed", { error: String(e) });
      return json({ error: "Failed to load repository refs" }, 500);
    }
  });

  router.put(`/:owner/:repo/admin/refs`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    const body = await safeParseJsonRequest(c.req.raw);
    const refs = AdminRefsPayloadSchema.safeParse(body);
    if (!refs.success) {
      return new Response("Invalid refs payload\n", { status: 400 });
    }
    try {
      await limiter.run("do:admin-set-refs", () => stub.setRefs(refs.data));
      await invalidateRepoRefsAndBranchCache(c, route).catch((error) => {
        log.warn("admin:invalidate-refs-cache-failed", { error: String(error) });
      });
      return new Response("OK\n");
    } catch (e) {
      log.error("admin:set-refs-failed", { error: String(e) });
      return json({ error: "Failed to update repository refs" }, 500);
    }
  });

  router.get(`/:owner/:repo/admin/head`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const head = await limiter.run("do:admin-get-head", () => stub.getHead());
      return json(head);
    } catch (e) {
      log.warn("admin:get-head-failed", { error: String(e) });
      return new Response("Not found\n", { status: 404 });
    }
  });

  router.put(`/:owner/:repo/admin/head`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    const body = await safeParseJsonRequest(c.req.raw);
    const head = AdminHeadPayloadSchema.safeParse(body);
    if (!head.success) {
      return new Response("Invalid head payload\n", { status: 400 });
    }
    try {
      await limiter.run("do:admin-set-head", () => stub.setHead(head.data));
      await invalidateRepoRefsAndBranchCache(c, route).catch((error) => {
        log.warn("admin:invalidate-head-cache-failed", { error: String(error) });
      });
      return new Response("OK\n");
    } catch (e) {
      log.error("admin:set-head-failed", { error: String(e) });
      return json({ error: "Failed to update repository HEAD" }, 500);
    }
  });

  router.get(`/:owner/:repo/admin/debug-state`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const state = await limiter.run("do:admin-debug-state", () => stub.debugState());
      return json(state);
    } catch (e) {
      log.warn("admin:debug-state-failed", { error: String(e) });
      return json({ error: "Failed to inspect repository state" }, 500);
    }
  });

  router.get(`/:owner/:repo/admin/debug-commit/:commit`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const commit = c.req.param("commit");
    if (!isValidOid(commit)) {
      return new Response("Invalid commit\n", { status: 400 });
    }
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const result = await limiter.run("do:admin-debug-commit", () =>
        stub.debugCheckCommit(commit)
      );
      return json(result);
    } catch (e) {
      log.warn("admin:debug-commit-failed", { commit, error: String(e) });
      return json({ error: "Failed to inspect repository commit" }, 500);
    }
  });

  router.get(`/:owner/:repo/admin/debug-oid/:oid`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const oid = c.req.param("oid");
    if (!isValidOid(oid)) {
      return new Response("Invalid OID\n", { status: 400 });
    }
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const result = await limiter.run("do:admin-debug-oid", () => stub.debugCheckOid(oid));
      return json(result);
    } catch (e) {
      log.warn("admin:debug-oid-failed", { oid, error: String(e) });
      return json({ error: "Failed to inspect repository object" }, 500);
    }
  });

  router.delete(`/:owner/:repo/admin/pack/:packKey`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, limiter } = gate;
    const packKey = c.req.param("packKey");
    if (!packKey) {
      return json({ error: "Pack key is required" }, 400);
    }
    const log = c.var.logFor({ service: "AdminRoutes", repoId: route.doName });
    const stub = getRepoStub(c.env, route.doName);
    try {
      const result = await limiter.run("do:admin-remove-pack", () => stub.removePack(packKey));
      if (result.rejected) {
        const error =
          result.rejected === "active-pack"
            ? "Active packs cannot be deleted until they are superseded"
            : "Only superseded packs can be deleted through this endpoint";
        return json(
          {
            ok: false,
            error,
            ...result,
          },
          409
        );
      }
      return json({ ok: result.removed, ...result });
    } catch (e) {
      log.warn("admin:remove-pack-failed", { packKey, error: String(e) });
      return json({ ok: false, error: "Failed to remove pack" }, 500);
    }
  });

  // DANGEROUS: completely delete the repository - D1 row, ROUTES KV, R2
  // objects, and DO storage. The request handler authorizes via
  // `requireRepoAdmin` (session + membership + same-origin) and confirms
  // the danger-zone payload, then enqueues a `repository-delete` task. The
  // queue consumer owns every side-effecting step so a queue-send failure
  // cannot leave D1 partially mutated and R2/DO orphaned.
  router.delete(`/:owner/:repo/admin/purge`, async (c) => {
    const gate = await requireRepoAdmin(c);
    if (gate.kind === "response") return gate.response;
    const { route, viewer } = gate;
    const owner = c.req.param("owner");
    const repo = c.req.param("repo");
    const log = c.var.logFor({
      service: "AdminPurge",
      repoId: route.doName,
    });
    const rawBody = await safeParseJsonRequest(c.req.raw);
    const parsedBody = AdminPurgeRequestSchema.safeParse(rawBody);
    const body = parsedBody.success ? parsedBody.data : { confirm: "" };
    const confirm = body.confirm;
    if (confirm !== `purge-${owner}/${repo}`) {
      return json(
        {
          error: "Confirmation required",
          hint: `Set confirm to "purge-${owner}/${repo}"`,
        },
        400
      );
    }

    const message: RepositoryDeleteMessage = {
      kind: "repository-delete",
      repositoryId: route.repositoryId,
      namespaceId: route.namespaceId,
      namespaceSlug: route.routeNamespaceSlug,
      repoSlug: route.routeRepoSlug,
      doName: route.doName,
      actor: viewer.userId,
      requestedAt: Date.now(),
    };
    let queued = true;
    try {
      // Required: a failed enqueue/cleanup must not leave partial state behind.
      // Returning 503 lets the operator retry safely.
      const dispatched = await dispatchRepositoryDelete({
        env: c.env,
        ctx: workerExecutionContext(c),
        message,
        log,
      });
      queued = dispatched.queued;
    } catch (error) {
      log.error("admin-purge:enqueue-failed", { error: String(error) });
      return json({ ok: false, error: "Failed to enqueue delete; please retry" }, 503);
    }
    log.info("admin-purge:enqueued", {
      actor: viewer.userId,
      queued,
      requestedAt: message.requestedAt,
    });
    return json({ ok: true, queued }, queued ? 202 : 200);
  });
}
