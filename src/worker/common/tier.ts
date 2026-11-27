/**
 * Cloudflare deployment plan tier helpers.
 *
 * - `"free"` (default in `wrangler.jsonc`): tuned for Cloudflare Workers Free
 *   plan (10ms CPU limit). Skips automatic heavy background pack compaction
 *   after pushes/web-commits so small repos stay well inside the free CPU and
 *   operation budgets, while keeping manual compaction and all Git/UI flows
 *   functional.
 * - `"paid"` (`wrangler.paid.jsonc` / `CLOUDFLARE_TIER=paid`): unlocks full
 *   automatic background compaction and pairs with `limits.cpu_ms = 300000`
 *   for large repositories and team workloads.
 */
export type CloudflarePlanTier = "free" | "paid";

export type CloudflareTierEnv = {
  CLOUDFLARE_TIER?: string;
  REPO_TASKS_QUEUE?: Queue;
};

export function resolveCloudflareTier(
  env: Pick<CloudflareTierEnv, "CLOUDFLARE_TIER">
): CloudflarePlanTier {
  const normalized = (env.CLOUDFLARE_TIER ?? "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "pro" || normalized === "enterprise") {
    return "paid";
  }
  return "free";
}

export function isFreeCloudflareTier(env: Pick<CloudflareTierEnv, "CLOUDFLARE_TIER">): boolean {
  return resolveCloudflareTier(env) === "free";
}

export function hasRepoTasksQueue(env: Pick<CloudflareTierEnv, "REPO_TASKS_QUEUE">): boolean {
  return Boolean(env.REPO_TASKS_QUEUE && typeof env.REPO_TASKS_QUEUE.send === "function");
}

/**
 * Automatic background compaction rewrites packfiles and re-indexes deltas.
 * On Workers Paid (`cpu_ms: 300000`), enqueue automatically whenever the DO
 * signals compaction is due. On Workers Free (10ms CPU limit), skip automatic
 * background compaction so pushes never trigger Error 1102 or burn free quotas.
 */
export function shouldAutoQueueBackgroundCompaction(env: CloudflareTierEnv): boolean {
  return hasRepoTasksQueue(env) && resolveCloudflareTier(env) === "paid";
}

/**
 * Maximum source pack bytes and object count permitted for manual compaction
 * when running on `CLOUDFLARE_TIER=free` (10ms CPU ceiling). Rewriting and
 * re-indexing larger multi-pack sets on the Free tier risks Cloudflare
 * Error 1102 (`Worker exceeded CPU time limit`).
 */
export const FREE_TIER_COMPACTION_MAX_BYTES = 4 * 1024 * 1024;
export const FREE_TIER_COMPACTION_MAX_OBJECTS = 2_500;

export function exceedsFreeTierCompactionBudget(
  env: Pick<CloudflareTierEnv, "CLOUDFLARE_TIER">,
  plan: { sourceBytes: number; sourceObjects: number }
): boolean {
  if (!isFreeCloudflareTier(env)) return false;
  return (
    plan.sourceBytes > FREE_TIER_COMPACTION_MAX_BYTES ||
    plan.sourceObjects > FREE_TIER_COMPACTION_MAX_OBJECTS
  );
}
