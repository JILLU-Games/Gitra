import type { CacheContext } from "@/worker/cache";
import type { Logger } from "@/worker/common/logger";
import type { RepoDurableObject } from "@/worker/do/repo/repoDO";
import type { IdxView } from "@/worker/git/object-store";

import { type PackRefBackfillQueueMessage, type RepoQueueMessageHandle } from "./types";

import { getRepoStubByDoId } from "@/worker/common";
import { loadActivePackCatalog, loadIdxView } from "@/worker/git/object-store";
import { countSubrequest, getLimiter } from "@/worker/git/operations/limits";
import { resolveDeltasAndWriteIdx, scanPack } from "@/worker/git/pack/indexer";
import { loadPackRefView } from "@/worker/git/pack/refIndex";
import { createQueueTaskContext, logSoftBudgetExhausted, retryQueueMessage } from "./context";

const REF_BACKFILL_SUBREQUEST_BUDGET = 7_500;
const REF_BACKFILL_RETRY_DELAY_SECONDS = 30;
export const INLINE_REF_BACKFILL_MAX_PACKS = 2;
export const INLINE_REF_BACKFILL_MAX_PACK_BYTES = 8 * 1024 * 1024;

function countBackfillSubrequest(cacheCtx: CacheContext, log: Logger, op: string, n = 1): void {
  logSoftBudgetExhausted({
    cacheCtx,
    log,
    flagPrefix: "ref-backfill-soft-budget",
    op,
    count: n,
  });
}

function isDeterministicPackFailure(error: unknown): boolean {
  const message = String(error);
  return (
    message.includes("invalid") ||
    message.includes("mismatch") ||
    message.includes("unsupported") ||
    message.includes("truncated") ||
    message.includes("cannot fit")
  );
}

/**
 * Executes a bounded inline `.refs` sidecar repair for a single active pack when
 * `REPO_TASKS_QUEUE` is unbound (Free-tier / `--no-queues` deployments).
 * Uses the request-scoped `Limiter` and subrequest counter on `cacheCtx`.
 */
export async function backfillPackRefsInline(args: {
  env: Env;
  repoId: string;
  packKey: string;
  packBytes: number;
  idxView: IdxView;
  cacheCtx?: CacheContext;
  log: Logger;
}): Promise<boolean> {
  const { env, repoId, packKey, packBytes, idxView, cacheCtx, log } = args;
  const limiter = getLimiter(cacheCtx);
  const savedCatalog = cacheCtx?.memo?.packCatalog;

  try {
    log.info("ref-index:inline-backfill-start", { packKey, packBytes });
    const activeCatalog = await loadActivePackCatalog(env, repoId, cacheCtx);
    const target = activeCatalog.find((row) => row.packKey === packKey);
    if (!target) {
      log.info("ref-index:inline-backfill-stale-pack", { packKey });
      return false;
    }

    const externalBaseCatalog = activeCatalog.filter((row) => row.packKey !== target.packKey);
    const scanResult = await scanPack({
      env,
      packKey: target.packKey,
      packSize: target.packBytes,
      limiter,
      countSubrequest: (n = 1) => {
        countSubrequest(cacheCtx, n);
      },
      log,
    });

    if (cacheCtx) {
      cacheCtx.memo = cacheCtx.memo || {};
      cacheCtx.memo.packCatalog = externalBaseCatalog;
    }
    const resolveResult = await resolveDeltasAndWriteIdx({
      env,
      packKey: target.packKey,
      packSize: target.packBytes,
      limiter,
      countSubrequest: (n = 1) => {
        countSubrequest(cacheCtx, n);
      },
      log,
      scanResult,
      activeCatalog: externalBaseCatalog,
      cacheCtx,
      repoId,
      writeIdx: false,
      existingIdxView: idxView,
    });

    log.info("ref-index:inline-backfill-complete", {
      packKey: target.packKey,
      objectCount: resolveResult.objectCount,
      refIndexBytes: resolveResult.refIndexBytes,
    });
    return true;
  } catch (error) {
    log.warn("ref-index:inline-backfill-failed", {
      packKey,
      error: String(error),
    });
    return false;
  } finally {
    if (cacheCtx?.memo) {
      cacheCtx.memo.packCatalog = savedCatalog;
    }
  }
}

export async function handlePackRefBackfillMessage(
  message: Omit<RepoQueueMessageHandle<PackRefBackfillQueueMessage>, "body">,
  body: PackRefBackfillQueueMessage,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const repoLabel = body.repoId || `do:${body.doId}`;
  const task = createQueueTaskContext({
    env,
    ctx,
    repoLabel,
    operation: "pack-refs",
    subrequestBudget: REF_BACKFILL_SUBREQUEST_BUDGET,
  });
  const log = task.logFor({
    service: "PackRefBackfillQueue",
    repoId: repoLabel,
    doId: body.doId,
  });
  const stub = getRepoStubByDoId(env, body.doId) as DurableObjectStub<RepoDurableObject>;
  const { cacheCtx, limiter } = task;

  try {
    log.info("ref-index:backfill-start", { packKey: body.packKey });

    countBackfillSubrequest(cacheCtx, log, "do:get-active-pack-catalog");
    const activeCatalog = await limiter.run("do:get-active-pack-catalog", async () => {
      return await stub.getActivePackCatalog();
    });
    cacheCtx.memo = cacheCtx.memo || {};
    cacheCtx.memo.packCatalog = activeCatalog;

    const target = activeCatalog.find((row) => row.packKey === body.packKey);
    if (!target) {
      log.info("ref-index:backfill-stale-pack", { packKey: body.packKey });
      message.ack();
      return;
    }
    const externalBaseCatalog = activeCatalog.filter((row) => row.packKey !== target.packKey);
    log.debug("ref-index:backfill-resolve-catalog", {
      packKey: target.packKey,
      activePacks: activeCatalog.length,
      externalBasePacks: externalBaseCatalog.length,
    });

    const idxView = await loadIdxView(env, target.packKey, cacheCtx, target.packBytes);
    if (!idxView) {
      log.warn("ref-index:backfill-invalid-pack", {
        packKey: target.packKey,
        reason: "missing-or-invalid-idx",
      });
      message.ack();
      return;
    }

    const existing = await loadPackRefView(env, target.packKey, idxView, cacheCtx);
    if (existing.type === "Ready") {
      log.info("ref-index:backfill-complete", {
        packKey: target.packKey,
        result: "already-present",
      });
      message.ack();
      return;
    }

    const scanResult = await scanPack({
      env,
      packKey: target.packKey,
      packSize: target.packBytes,
      limiter,
      countSubrequest: (n = 1) => countBackfillSubrequest(cacheCtx, log, "r2:scan-pack", n),
      log,
    });

    cacheCtx.memo.packCatalog = externalBaseCatalog;
    const resolveResult = await resolveDeltasAndWriteIdx({
      env,
      packKey: target.packKey,
      packSize: target.packBytes,
      limiter,
      countSubrequest: (n = 1) => countBackfillSubrequest(cacheCtx, log, "r2:resolve-pack", n),
      log,
      scanResult,
      activeCatalog: externalBaseCatalog,
      cacheCtx,
      repoId: repoLabel,
      writeIdx: false,
      existingIdxView: idxView,
    });

    log.info("ref-index:backfill-complete", {
      packKey: target.packKey,
      objectCount: resolveResult.objectCount,
      refIndexBytes: resolveResult.refIndexBytes,
    });
    message.ack();
  } catch (error) {
    if (isDeterministicPackFailure(error)) {
      log.warn("ref-index:backfill-invalid-pack", {
        packKey: body.packKey,
        error: String(error),
      });
      message.ack();
      return;
    }

    log.warn("ref-index:backfill-retry", {
      packKey: body.packKey,
      error: String(error),
    });
    retryQueueMessage(message, REF_BACKFILL_RETRY_DELAY_SECONDS);
  }
}
