import type { Logger } from "@/worker/common/logger";
import { shouldAutoQueueBackgroundCompaction } from "@/worker/common/tier";
import type { RepoStateSchema } from "../repoState";

import { asTypedSyncStorage } from "../repoState";
import {
  applyReceiveCommands,
  isValidRefName,
  type ReceiveCommand,
  type ReceiveStatus,
  validateReceiveCommands,
} from "@/worker/git/operations/validation";
import { getDb, listActivePackCatalogSync, upsertPackCatalogRowSync } from "../db";
import { DEFAULT_HEAD, bumpPacksetVersionSync, ensureRepoMetadataDefaultsSync } from "./shared";
import { catalogNeedsCompaction, scheduleCompactionWake } from "./compaction/plan";

export type FinalizeReceiveResult =
  | {
      status: "committed";
      statuses: ReceiveStatus[];
      changed: boolean;
      empty: boolean;
      shouldQueueCompaction: boolean;
    }
  | {
      status: "ref_conflict";
      statuses: ReceiveStatus[];
      message: string;
    }
  | {
      status: "lease_mismatch";
      message: string;
    };

function resolveHeadAfterReceive(args: {
  storedHead:
    | {
        target: string;
        oid?: string;
        unborn?: boolean;
      }
    | undefined;
  refs: Array<{ name: string; oid: string }>;
}) {
  const target = args.storedHead?.target || DEFAULT_HEAD.target;
  const match = args.refs.find((ref) => ref.name === target);
  if (match) {
    return { target, oid: match.oid } as const;
  }
  return { target, unborn: true } as const;
}

export async function finalizeReceiveState(args: {
  ctx: DurableObjectState;
  env: Env;
  token: string;
  commands: ReceiveCommand[];
  stagedPack?:
    | {
        packKey: string;
        packBytes: number;
        idxBytes: number;
        objectCount: number;
      }
    | undefined;
  logger?: Logger;
}): Promise<FinalizeReceiveResult> {
  // Perform all DO KV and SQLite mutations atomically inside a single SQLite
  // transaction so a mid-commit failure never leaves refs ahead of pack_catalog or vice versa.
  const txOutcome = args.ctx.storage.transactionSync(() => {
    const kv = asTypedSyncStorage<RepoStateSchema>(args.ctx.storage);
    ensureRepoMetadataDefaultsSync(kv);

    const lease = kv.get("receiveLease");
    if (!lease || lease.token !== args.token) {
      return {
        kind: "lease_mismatch" as const,
        result: {
          status: "lease_mismatch" as const,
          message: "Receive lease is no longer active for this request.",
        },
      };
    }

    const currentRefs = kv.get("refs") || [];
    const invalidStatuses = args.commands
      .filter((command) => !isValidRefName(command.ref))
      .map((command) => ({ ref: command.ref, ok: false, msg: "invalid" satisfies string }));
    if (invalidStatuses.length > 0) {
      kv.delete("receiveLease");
      return {
        kind: "invalid_ref" as const,
        invalidCount: invalidStatuses.length,
        result: {
          status: "ref_conflict" as const,
          statuses: invalidStatuses,
          message: "Receive finalization rejected invalid refs.",
        },
      };
    }

    const statuses = validateReceiveCommands(currentRefs, args.commands);
    if (!statuses.every((status) => status.ok)) {
      kv.delete("receiveLease");
      return {
        kind: "ref_conflict" as const,
        conflictCount: statuses.filter((status) => !status.ok).length,
        result: {
          status: "ref_conflict" as const,
          statuses,
          message: "Ref expectations changed before the receive could be committed.",
        },
      };
    }

    const nextRefs = applyReceiveCommands(currentRefs, args.commands);
    const storedHead = kv.get("head");
    const nextHead = resolveHeadAfterReceive({ storedHead, refs: nextRefs });
    const nextRefsVersion = (kv.get("refsVersion") || 0) + 1;
    const now = Date.now();

    let shouldQueueCompaction = false;
    if (args.stagedPack) {
      const nextPackSeq = kv.get("nextPackSeq") || 1;
      const db = getDb(args.ctx.storage);
      upsertPackCatalogRowSync(db, {
        packKey: args.stagedPack.packKey,
        kind: "receive",
        state: "active",
        tier: 0,
        seqLo: nextPackSeq,
        seqHi: nextPackSeq,
        objectCount: args.stagedPack.objectCount,
        packBytes: args.stagedPack.packBytes,
        idxBytes: args.stagedPack.idxBytes,
        createdAt: now,
        supersededBy: null,
      });
      kv.put("nextPackSeq", nextPackSeq + 1);
      const activeCatalog = listActivePackCatalogSync(db);
      bumpPacksetVersionSync(kv);
      shouldQueueCompaction =
        catalogNeedsCompaction(activeCatalog) && shouldAutoQueueBackgroundCompaction(args.env);
      if (shouldQueueCompaction) {
        kv.put("compactionWantedAt", now);
      }
    }

    kv.put("refs", nextRefs);
    kv.put("head", nextHead);
    kv.put("refsVersion", nextRefsVersion);
    kv.delete("receiveLease");

    return {
      kind: "committed" as const,
      refCount: nextRefs.length,
      shouldQueueCompaction,
      result: {
        status: "committed" as const,
        statuses,
        changed: args.commands.length > 0,
        empty: nextRefs.length === 0,
        shouldQueueCompaction,
      },
    };
  });

  if (txOutcome.kind === "invalid_ref") {
    args.logger?.warn("receive:finalize-invalid-ref", {
      invalidCount: txOutcome.invalidCount,
    });
    return txOutcome.result;
  }

  if (txOutcome.kind === "ref_conflict") {
    args.logger?.warn("receive:finalize-ref-conflict", {
      conflictCount: txOutcome.conflictCount,
    });
    return txOutcome.result;
  }

  if (txOutcome.kind === "lease_mismatch") {
    return txOutcome.result;
  }

  if (txOutcome.shouldQueueCompaction) {
    await scheduleCompactionWake(args.ctx, args.env);
  }

  args.logger?.info("receive:finalize-committed", {
    commandCount: args.commands.length,
    refCount: txOutcome.refCount,
    empty: txOutcome.result.empty,
    stagedPackKey: args.stagedPack?.packKey,
    shouldQueueCompaction: txOutcome.shouldQueueCompaction,
  });

  return txOutcome.result;
}
