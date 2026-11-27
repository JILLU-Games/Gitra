/**
 * Admin-facing compaction state transitions: preview, request, and clear.
 *
 * These operations are triggered by POST/DELETE on /admin/compact.
 * They read or mutate `compactionWantedAt` in DO storage but never
 * acquire or release compaction leases.
 */
import type { Logger } from "@/worker/common/logger";
import {
  exceedsFreeTierCompactionBudget,
  FREE_TIER_COMPACTION_MAX_BYTES,
  FREE_TIER_COMPACTION_MAX_OBJECTS,
  hasRepoTasksQueue,
} from "@/worker/common/tier";
import type { RepoStateSchema } from "../../repoState";

import { asTypedStorage } from "../../repoState";
import {
  loadCompactionContext,
  scheduleCompactionWake,
  type PreviewCompactionResult,
  type RequestCompactionResult,
  type ClearCompactionRequestResult,
} from "./plan";

/**
 * Preview the current compaction plan without recording a request.
 *
 * Returns a plan whenever the active catalog has a tier overflow, regardless
 * of whether `compactionWantedAt` is set. The `queued` field indicates
 * whether a background compaction request is already recorded.
 */
export async function previewCompactionState(args: {
  ctx: DurableObjectState;
  env: Env;
  prefix: string;
  logger?: Logger;
}): Promise<PreviewCompactionResult> {
  const context = await loadCompactionContext(args);
  const queued = typeof context.wantedAt === "number";

  if (!context.plan) {
    args.logger?.info("compaction:preview-no-work", {
      reason: "below-threshold",
      queued,
    });
    return {
      action: "preview",
      status: "no_work",
      queued,
      wantedAt: context.wantedAt,
      activeCatalog: context.activeCatalog,
      packCatalogVersion: context.packCatalogVersion,
      reason: "below-threshold",
      message: "The active pack catalog is already within the compaction policy.",
    };
  }

  args.logger?.info("compaction:preview", {
    queued,
    sourceTier: context.plan.sourceTier,
    targetTier: context.plan.targetTier,
    sourceCount: context.plan.sourcePacks.length,
  });
  return {
    action: "preview",
    status: "ok",
    queued,
    wantedAt: context.wantedAt,
    activeCatalog: context.activeCatalog,
    packCatalogVersion: context.packCatalogVersion,
    plan: context.plan,
    message: "The active pack catalog has compactable tiers.",
  };
}

/**
 * Record a compaction request and schedule background work.
 *
 * Only succeeds when the active catalog actually has a tier overflow,
 * `REPO_TASKS_QUEUE` is bound, and the plan fits the current tier's CPU budget.
 * Clears stale `compactionWantedAt` when no plan exists or queueing is unavailable.
 */
export async function requestCompactionState(args: {
  ctx: DurableObjectState;
  env: Env;
  prefix: string;
  logger?: Logger;
}): Promise<RequestCompactionResult> {
  const context = await loadCompactionContext(args);

  if (!context.plan) {
    if (typeof context.wantedAt === "number") {
      await context.store.delete("compactionWantedAt");
    }
    args.logger?.info("compaction:request-no-work", {});
    return {
      action: "request",
      status: "no_work",
      queued: false,
      shouldEnqueue: false,
      activeCatalog: context.activeCatalog,
      packCatalogVersion: context.packCatalogVersion,
      reason: "below-threshold",
      message: "The active pack catalog is already within the compaction policy.",
    };
  }

  if (!hasRepoTasksQueue(args.env)) {
    if (typeof context.wantedAt === "number") {
      await context.store.delete("compactionWantedAt");
    }
    args.logger?.warn("compaction:request-rejected-no-queue", {
      sourceTier: context.plan.sourceTier,
      sourceCount: context.plan.sourcePacks.length,
    });
    return {
      action: "request",
      status: "rejected",
      queued: false,
      shouldEnqueue: false,
      activeCatalog: context.activeCatalog,
      packCatalogVersion: context.packCatalogVersion,
      plan: context.plan,
      reason: "queues-required",
      message:
        "Background pack compaction requires the REPO_TASKS_QUEUE Cloudflare Queues binding.",
    };
  }

  if (exceedsFreeTierCompactionBudget(args.env, context.plan)) {
    if (typeof context.wantedAt === "number") {
      await context.store.delete("compactionWantedAt");
    }
    args.logger?.warn("compaction:request-rejected-free-tier-budget", {
      sourceBytes: context.plan.sourceBytes,
      sourceObjects: context.plan.sourceObjects,
      maxBytes: FREE_TIER_COMPACTION_MAX_BYTES,
      maxObjects: FREE_TIER_COMPACTION_MAX_OBJECTS,
    });
    return {
      action: "request",
      status: "rejected",
      queued: false,
      shouldEnqueue: false,
      activeCatalog: context.activeCatalog,
      packCatalogVersion: context.packCatalogVersion,
      plan: context.plan,
      reason: "free-tier-budget-exceeded",
      message: `Compaction plan (${context.plan.sourceBytes} bytes, ${context.plan.sourceObjects} objects) exceeds the Cloudflare Free tier CPU safety budget (${FREE_TIER_COMPACTION_MAX_BYTES} bytes, ${FREE_TIER_COMPACTION_MAX_OBJECTS} objects). Switch to CLOUDFLARE_TIER=paid for large pack rewrites.`,
    };
  }

  const wantedAt = Date.now();
  await context.store.put("compactionWantedAt", wantedAt);
  await scheduleCompactionWake(args.ctx, args.env);

  args.logger?.info("compaction:request", {
    wantedAt,
    sourceTier: context.plan.sourceTier,
    targetTier: context.plan.targetTier,
    sourceCount: context.plan.sourcePacks.length,
  });
  return {
    action: "request",
    status: "queued",
    queued: true,
    shouldEnqueue: true,
    wantedAt,
    activeCatalog: context.activeCatalog,
    packCatalogVersion: context.packCatalogVersion,
    plan: context.plan,
    message: "Recorded a compaction request for this repository and queued background work.",
  };
}

/** Clear any recorded compaction request without affecting active leases. */
export async function clearCompactionRequestState(args: {
  ctx: DurableObjectState;
  logger?: Logger;
}): Promise<ClearCompactionRequestResult> {
  const store = asTypedStorage<RepoStateSchema>(args.ctx.storage);
  const hadQueuedWork = typeof (await store.get("compactionWantedAt")) === "number";
  await store.delete("compactionWantedAt");
  args.logger?.info("compaction:clear", {
    hadQueuedWork,
  });
  return {
    action: "cleared",
    cleared: hadQueuedWork,
    message: hadQueuedWork
      ? "Cleared the recorded compaction request."
      : "No recorded compaction request was present.",
  };
}
