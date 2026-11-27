import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  exceedsFreeTierCompactionBudget,
  FREE_TIER_COMPACTION_MAX_BYTES,
  FREE_TIER_COMPACTION_MAX_OBJECTS,
  hasRepoTasksQueue,
  isFreeCloudflareTier,
  resolveCloudflareTier,
  shouldAutoQueueBackgroundCompaction,
} from "../src/worker/common/tier";

function parseJsonc(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf8");
  const withoutComments = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(withoutComments) as Record<string, unknown>;
}

const mockQueue = {
  async send() {},
  async sendBatch() {},
} as unknown as Queue;

test("resolveCloudflareTier defaults to free and recognizes paid aliases", () => {
  assert.equal(resolveCloudflareTier({}), "free");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "" }), "free");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "free" }), "free");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "FREE" }), "free");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "unknown" }), "free");

  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "paid" }), "paid");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "PAID" }), "paid");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "pro" }), "paid");
  assert.equal(resolveCloudflareTier({ CLOUDFLARE_TIER: "enterprise" }), "paid");

  assert.equal(isFreeCloudflareTier({}), true);
  assert.equal(isFreeCloudflareTier({ CLOUDFLARE_TIER: "free" }), true);
  assert.equal(isFreeCloudflareTier({ CLOUDFLARE_TIER: "paid" }), false);
});

test("hasRepoTasksQueue safely detects optional queue binding", () => {
  assert.equal(hasRepoTasksQueue({}), false);
  assert.equal(hasRepoTasksQueue({ REPO_TASKS_QUEUE: undefined }), false);
  assert.equal(hasRepoTasksQueue({ REPO_TASKS_QUEUE: mockQueue }), true);
});

test("shouldAutoQueueBackgroundCompaction only enables on paid tier with queue bound", () => {
  assert.equal(
    shouldAutoQueueBackgroundCompaction({ CLOUDFLARE_TIER: "free", REPO_TASKS_QUEUE: mockQueue }),
    false
  );
  assert.equal(shouldAutoQueueBackgroundCompaction({ REPO_TASKS_QUEUE: mockQueue }), false);
  assert.equal(shouldAutoQueueBackgroundCompaction({ CLOUDFLARE_TIER: "paid" }), false);
  assert.equal(
    shouldAutoQueueBackgroundCompaction({ CLOUDFLARE_TIER: "paid", REPO_TASKS_QUEUE: mockQueue }),
    true
  );
});

test("exceedsFreeTierCompactionBudget enforces byte and object safety ceilings only on free tier", () => {
  assert.equal(
    exceedsFreeTierCompactionBudget(
      { CLOUDFLARE_TIER: "free" },
      {
        sourceBytes: FREE_TIER_COMPACTION_MAX_BYTES,
        sourceObjects: FREE_TIER_COMPACTION_MAX_OBJECTS,
      }
    ),
    false
  );
  assert.equal(
    exceedsFreeTierCompactionBudget(
      { CLOUDFLARE_TIER: "free" },
      { sourceBytes: FREE_TIER_COMPACTION_MAX_BYTES + 1, sourceObjects: 10 }
    ),
    true
  );
  assert.equal(
    exceedsFreeTierCompactionBudget(
      { CLOUDFLARE_TIER: "free" },
      { sourceBytes: 1024, sourceObjects: FREE_TIER_COMPACTION_MAX_OBJECTS + 1 }
    ),
    true
  );
  assert.equal(
    exceedsFreeTierCompactionBudget(
      { CLOUDFLARE_TIER: "paid" },
      {
        sourceBytes: FREE_TIER_COMPACTION_MAX_BYTES * 10,
        sourceObjects: FREE_TIER_COMPACTION_MAX_OBJECTS * 10,
      }
    ),
    false
  );
});

test("wrangler.jsonc is Cloudflare Free Plan compatible by default", () => {
  const freeConfig = parseJsonc(path.resolve("wrangler.jsonc"));
  assert.equal(freeConfig.workers_dev, true);
  assert.equal(
    "limits" in freeConfig,
    false,
    "Free wrangler.jsonc must not include Paid-only limits.cpu_ms"
  );
  assert.equal(
    "routes" in freeConfig,
    false,
    "Default wrangler.jsonc should not hardcode a foreign custom domain"
  );

  const vars = freeConfig.vars as Record<string, string>;
  assert.equal(vars.CLOUDFLARE_TIER, "free");
});

test("wrangler.paid.jsonc enables Paid Plan CPU ceiling and paid tier policy", () => {
  const paidConfig = parseJsonc(path.resolve("wrangler.paid.jsonc"));
  assert.equal(paidConfig.workers_dev, true);

  const limits = paidConfig.limits as Record<string, number>;
  assert.equal(limits.cpu_ms, 300000);

  const vars = paidConfig.vars as Record<string, string>;
  assert.equal(vars.CLOUDFLARE_TIER, "paid");
});
