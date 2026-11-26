import type { Head } from "./repoState";
import type { RepoActivity } from "@/worker/common";
import type { PackCatalogRow } from "./db/schema";

import { DurableObject } from "cloudflare:workers";

import { doPrefix } from "@/worker/keys";
import { text, createLogger } from "@/worker/common";
import { clearRepositoryStorage, removePack, type RemovePackResult } from "./packOperations";
import {
  abortCompactionLease,
  abortReceiveLease,
  type BeginCompactionResult,
  beginCompactionState,
  beginReceiveLease,
  type ClearCompactionRequestResult,
  clearCompactionRequestState,
  clearExpiredLeases,
  type CommitCompactionResult,
  commitCompactionState,
  finalizeReceiveState,
  type PreviewCompactionResult,
  previewCompactionState,
  type RequestCompactionResult,
  requestCompactionState,
  rearmCompactionQueueFromAlarm,
  getActivePackCatalogSnapshot,
  getRepoActivitySnapshot,
} from "./catalog";
import { getRefs, setRefs, resolveHead, setHead, getHeadAndRefs } from "./refs";
import { handleIdleAndMaintenance } from "./maintenance";
import {
  debugState,
  debugCheckCommit,
  debugCheckOid,
  type DebugCommitCheck,
  type DebugOidCheck,
  type DebugStateSnapshot,
} from "./debug";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { getDb } from "./db";
import migrations from "../../../../drizzle/repo-do/migrations.js";
import { ensureAccessAndAlarm, type RepoDOAccessContext } from "./repoDO/access";
import { seedMinimalRepoState } from "./repoDO/seeding";

/**
 * Repository Durable Object (per-repo authority)
 *
 * Responsibilities
 * - Acts as the strongly consistent source of truth for repository metadata.
 * - Stores refs, HEAD, and pack catalog state in DO storage/SQLite.
 * - All operations are provided as typed RPC methods on the class.
 *
 * Read Path (RPC)
 * - Correctness reads live in worker-local pack-first helpers under `src/worker/git/object-store/`.
 * - There is no public HTTP endpoint for object reads; this keeps internal state access typed
 *   and easy to audit.
 *
 * Write Path
 * - Streaming receive: the Worker writes staged `.pack` and `.idx` data to R2, then
 *   commits refs and pack-catalog metadata through typed DO RPCs.
 *
 * Maintenance & Background Work
 * - `alarm()` handles: lease cleanup, compaction queue re-arm, idle cleanup.
 * - The DO is the metadata authority; the data plane lives in R2 packs.
 */
export class RepoDurableObject extends DurableObject {
  declare env: Env;
  private lastAccessMemMs: number | undefined;
  private schemaReady = false;
  private schemaInitPromise: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.lastAccessMemMs = await ctx.storage.get("lastAccessMs");
      await this.ensureSchema();
      // The constructor also runs before `alarm()`. Do not touch
      // `lastAccessMs` here, or an alarm wakeup would make an idle object look
      // freshly accessed and would keep cleanup from ever seeing it as idle.
    });
  }

  /**
   * Re-runs Drizzle SQLite migrations lazily if storage was wiped on a warm
   * DO instance (for example after `clearRepositoryStorage()` or idle cleanup).
   * Deduplicates concurrent callers without using `blockConcurrencyWhile` in RPCs.
   */
  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (!this.schemaInitPromise) {
      this.schemaInitPromise = (async () => {
        const db = getDb(this.ctx.storage);
        await migrate(db, migrations);
        this.schemaReady = true;
      })().finally(() => {
        this.schemaInitPromise = undefined;
      });
    }
    await this.schemaInitPromise;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      await this.ensureAccessAndAlarm();
    } catch {}
    this.logger.debug("fetch", { path: new URL(request.url).pathname, method: request.method });
    return text("Not found\n", 404);
  }

  async alarm(): Promise<void> {
    this.logger.debug("alarm:start", {});
    await this.ensureSchema();

    await clearExpiredLeases(this.ctx, this.logger);

    if (
      await rearmCompactionQueueFromAlarm({ ctx: this.ctx, env: this.env, logger: this.logger })
    ) {
      return;
    }

    const deletedStorage = await handleIdleAndMaintenance(this.ctx, this.env, this.logger);
    if (deletedStorage) {
      this.lastAccessMemMs = undefined;
      this.schemaReady = false;
    }
    this.logger.debug("alarm:end", {});
  }

  private async ensureAccessAndAlarm(): Promise<void> {
    await this.ensureSchema();
    await ensureAccessAndAlarm(this.accessContext());
  }

  private accessContext(): RepoDOAccessContext {
    return {
      ctx: this.ctx,
      env: this.env,
      logger: this.logger,
      getLastAccessMemMs: () => this.lastAccessMemMs,
      setLastAccessMemMs: (value) => {
        this.lastAccessMemMs = value;
      },
    };
  }

  public async listRefs(): Promise<{ name: string; oid: string }[]> {
    await this.ensureAccessAndAlarm();
    return await getRefs(this.ctx);
  }

  public async setRefs(refs: { name: string; oid: string }[]): Promise<void> {
    await this.ensureAccessAndAlarm();
    await setRefs(this.ctx, refs);
  }

  public async getHead(): Promise<Head> {
    await this.ensureAccessAndAlarm();
    return await resolveHead(this.ctx);
  }

  public async setHead(head: Head): Promise<void> {
    await this.ensureAccessAndAlarm();
    await setHead(this.ctx, head);
  }

  public async getHeadAndRefs(): Promise<{ head: Head; refs: { name: string; oid: string }[] }> {
    await this.ensureAccessAndAlarm();
    return await getHeadAndRefs(this.ctx);
  }

  public async getActivePackCatalog(): Promise<PackCatalogRow[]> {
    await this.ensureAccessAndAlarm();
    return await getActivePackCatalogSnapshot(this.ctx);
  }

  public async getRepoActivity(): Promise<RepoActivity | null> {
    await this.ensureAccessAndAlarm();
    const snapshot = await getRepoActivitySnapshot(this.ctx);
    if (snapshot.state === "idle") return null;
    return {
      state: snapshot.state,
      startedAt: snapshot.lease.createdAt,
      expiresAt: snapshot.lease.expiresAt,
    };
  }

  public async beginReceive() {
    await this.ensureAccessAndAlarm();
    return await beginReceiveLease(this.ctx, this.logger);
  }

  public async abortReceive(token: string): Promise<boolean> {
    await this.ensureAccessAndAlarm();
    return await abortReceiveLease(this.ctx, token);
  }

  public async finalizeReceive(args: {
    token: string;
    commands: Array<{ oldOid: string; newOid: string; ref: string }>;
    stagedPack?:
      | {
          packKey: string;
          packBytes: number;
          idxBytes: number;
          objectCount: number;
        }
      | undefined;
  }) {
    await this.ensureAccessAndAlarm();
    return await finalizeReceiveState({
      ctx: this.ctx,
      env: this.env,
      token: args.token,
      commands: args.commands,
      stagedPack: args.stagedPack,
      logger: this.logger,
    });
  }

  public async beginCompaction(): Promise<BeginCompactionResult> {
    await this.ensureAccessAndAlarm();
    return await beginCompactionState({
      ctx: this.ctx,
      env: this.env,
      prefix: this.prefix(),
      logger: this.logger,
    });
  }

  public async abortCompaction(token: string): Promise<boolean> {
    await this.ensureAccessAndAlarm();
    return await abortCompactionLease(this.ctx, token);
  }

  public async commitCompaction(args: {
    token: string;
    sourcePacks: PackCatalogRow[];
    targetTier: number;
    packsetVersion: number;
    stagedPack: {
      packKey: string;
      packBytes: number;
      idxBytes: number;
      objectCount: number;
    };
  }): Promise<CommitCompactionResult> {
    await this.ensureAccessAndAlarm();
    return await commitCompactionState({
      ctx: this.ctx,
      env: this.env,
      token: args.token,
      sourcePacks: args.sourcePacks,
      targetTier: args.targetTier,
      packsetVersion: args.packsetVersion,
      stagedPack: args.stagedPack,
      logger: this.logger,
    });
  }

  public async previewCompaction(): Promise<PreviewCompactionResult> {
    await this.ensureAccessAndAlarm();
    return await previewCompactionState({
      ctx: this.ctx,
      env: this.env,
      prefix: this.prefix(),
      logger: this.logger,
    });
  }

  public async requestCompaction(): Promise<RequestCompactionResult> {
    await this.ensureAccessAndAlarm();
    return await requestCompactionState({
      ctx: this.ctx,
      env: this.env,
      prefix: this.prefix(),
      logger: this.logger,
    });
  }

  public async clearCompactionRequest(): Promise<ClearCompactionRequestResult> {
    await this.ensureAccessAndAlarm();
    return await clearCompactionRequestState({
      ctx: this.ctx,
      logger: this.logger,
    });
  }

  public async debugState(): Promise<DebugStateSnapshot> {
    await this.ensureAccessAndAlarm();
    return await debugState(this.ctx, this.env);
  }

  public async debugCheckCommit(commit: string): Promise<DebugCommitCheck> {
    await this.ensureAccessAndAlarm();
    return await debugCheckCommit(this.ctx, this.env, commit);
  }

  public async debugCheckOid(oid: string): Promise<DebugOidCheck> {
    await this.ensureAccessAndAlarm();
    return await debugCheckOid(this.ctx, this.env, oid);
  }

  private prefix() {
    return doPrefix(this.ctx.id.toString());
  }

  private get logger() {
    return createLogger(this.env.LOG_LEVEL, {
      service: "RepoDO",
      doId: this.ctx.id.toString(),
    });
  }

  public async seedMinimalRepo(
    withPack: boolean = true
  ): Promise<{ commitOid: string; treeOid: string }> {
    await this.ensureAccessAndAlarm();
    return await seedMinimalRepoState({
      ctx: this.ctx,
      env: this.env,
      prefix: this.prefix(),
      withPack,
    });
  }

  // DO-only storage clear used by the `repository-delete` queue consumer
  // after R2 cleanup. Callers must NOT chain this from a Worker handler that
  // also enumerates R2 - that would be the forbidden Worker -> DO -> R2 hop.
  public async clearRepositoryStorage(): Promise<{ deletedDO: boolean }> {
    const result = await clearRepositoryStorage(this.ctx, this.env);
    // deleteAll() removes both SQLite tables and KV entries; reset in-memory flags so warm reuse re-migrates cleanly.
    this.lastAccessMemMs = undefined;
    this.schemaReady = false;
    return result;
  }

  public async removePack(packKey: string): Promise<RemovePackResult> {
    await this.ensureAccessAndAlarm();
    return await removePack(this.ctx, this.env, packKey);
  }
}
