import type { Logger } from "@/worker/common/logger";
import { hasRepoTasksQueue } from "@/worker/common/tier";

import { handleRepositoryDeleteMessage } from "./repositoryDelete";
import { handleRouteCacheSyncMessage } from "./routeCacheSync";
import type {
  RepoQueueMessageHandle,
  RepoTaskQueueMessage,
  RepositoryDeleteMessage,
  RouteCacheSyncMessage,
} from "./types";

function createInlineMessageHandle<Body>(id: string): {
  handle: Omit<RepoQueueMessageHandle<Body>, "body">;
  wasRetried: () => boolean;
} {
  let retried = false;
  return {
    handle: {
      id,
      timestamp: new Date(),
      attempts: 1,
      ack() {
        // Inline execution completed.
      },
      retry() {
        retried = true;
      },
    },
    wasRetried: () => retried,
  };
}

/**
 * Enqueues a route-cache-sync message when `REPO_TASKS_QUEUE` is bound, or
 * executes the lightweight D1 -> KV convergence directly in `waitUntil` when
 * running a minimal Free-tier deployment without Queues.
 */
export function dispatchRouteCacheSync(args: {
  env: Env;
  ctx: ExecutionContext;
  message: RouteCacheSyncMessage;
  log: Logger;
}): void {
  const { env, ctx, message, log } = args;
  if (hasRepoTasksQueue(env)) {
    ctx.waitUntil(
      env.REPO_TASKS_QUEUE.send(message).catch((error) => {
        log.warn("route-cache-sync:enqueue-failed", {
          repositoryId: message.repositoryId,
          namespaceSlug: message.namespaceSlug,
          repoSlug: message.repoSlug,
          error: String(error),
        });
      })
    );
    return;
  }

  log.debug("route-cache-sync:inline-fallback", {
    repositoryId: message.repositoryId,
    namespaceSlug: message.namespaceSlug,
    repoSlug: message.repoSlug,
  });
  const inline = createInlineMessageHandle<RouteCacheSyncMessage>(
    `inline-route-sync-${message.repositoryId}`
  );
  ctx.waitUntil(
    handleRouteCacheSyncMessage(inline.handle, message, env, ctx).catch((error) => {
      log.warn("route-cache-sync:inline-failed", {
        repositoryId: message.repositoryId,
        error: String(error),
      });
    })
  );
}

/**
 * Enqueues a repository deletion job onto `REPO_TASKS_QUEUE`, or runs cleanup
 * inline when no Queue binding is configured (Free-tier minimal setup).
 */
export async function dispatchRepositoryDelete(args: {
  env: Env;
  ctx: ExecutionContext;
  message: RepositoryDeleteMessage;
  log: Logger;
}): Promise<{ queued: boolean }> {
  const { env, ctx, message, log } = args;
  if (hasRepoTasksQueue(env)) {
    await env.REPO_TASKS_QUEUE.send(message);
    return { queued: true };
  }

  log.info("repo-delete:inline-fallback", {
    repositoryId: message.repositoryId,
    namespaceSlug: message.namespaceSlug,
    repoSlug: message.repoSlug,
  });
  const inline = createInlineMessageHandle<RepositoryDeleteMessage>(
    `inline-repo-delete-${message.repositoryId}`
  );
  await handleRepositoryDeleteMessage(inline.handle, message, env, ctx);
  if (inline.wasRetried()) {
    throw new Error("Inline repository cleanup did not complete; please retry");
  }
  return { queued: false };
}

/**
 * Safely enqueues an optional background maintenance message (compaction,
 * compaction-delete, pack-ref-backfill) only when `REPO_TASKS_QUEUE` is bound.
 */
export async function sendOptionalMaintenanceTask(args: {
  env: Env;
  message: Exclude<RepoTaskQueueMessage, RouteCacheSyncMessage | RepositoryDeleteMessage>;
  log?: Logger;
  delaySeconds?: number;
}): Promise<boolean> {
  if (!hasRepoTasksQueue(args.env)) {
    args.log?.debug("queue:maintenance-skipped-no-binding", {
      kind: args.message.kind,
      doId: args.message.doId,
    });
    return false;
  }
  if (typeof args.delaySeconds === "number" && args.delaySeconds > 0) {
    await args.env.REPO_TASKS_QUEUE.send(args.message, { delaySeconds: args.delaySeconds });
  } else {
    await args.env.REPO_TASKS_QUEUE.send(args.message);
  }
  return true;
}
