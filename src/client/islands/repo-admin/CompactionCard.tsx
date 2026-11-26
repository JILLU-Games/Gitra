import { Check, Clock, Download, Info, Play, Search, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { JsonResult } from "./JsonResult";
import type { AdminState, CompactionData } from "./types";

export type CompactionCardProps = {
  compactionData?: CompactionData;
  compactionStartedAt?: string | null;
  compactionStatus: string;
  state: AdminState;
  pending: Record<string, boolean>;
  startCompaction: (dryRun: boolean) => Promise<void>;
  clearCompaction: () => Promise<void>;
  compactionResult: unknown;
};

export function CompactionCard({
  compactionData,
  compactionStartedAt,
  compactionStatus,
  state,
  pending,
  startCompaction,
  clearCompaction,
  compactionResult,
}: CompactionCardProps) {
  const receiveStartedAt = state.receiveLease
    ? new Date(state.receiveLease.createdAt).toLocaleString()
    : null;
  const queuedCompactionAt = compactionData?.wantedAt
    ? new Date(compactionData.wantedAt).toLocaleString()
    : null;

  return (
    <Card>
      <h2 className="mb-2 text-[14px] font-semibold text-fg">Pack Compaction</h2>
      <p className="mb-3.5 text-[13px] text-fgBody">
        Receive and compaction leases are the live background activity signals for this repository.
        Automatic compaction runs after packs accumulate past the compaction threshold.
      </p>

      {state.receiveLease ? (
        <div className="mb-3.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-300">
          <div>
            <strong>
              <Download
                className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-amber-400"
                aria-hidden="true"
              />
              Receiving:
            </strong>{" "}
            receive lease is active
            {receiveStartedAt ? ` • Started ${receiveStartedAt}` : ""}
          </div>
        </div>
      ) : compactionData?.running ? (
        <div className="mb-3.5 rounded-md border border-accent/30 bg-accent/10 p-3 text-[12px] text-accent">
          <div>
            <strong>
              <Info
                className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-accent"
                aria-hidden="true"
              />
              Running:
            </strong>{" "}
            compaction lease is active
            {compactionStartedAt ? ` • Started ${compactionStartedAt}` : ""}
          </div>
        </div>
      ) : compactionData?.queued ? (
        <div className="mb-3.5 rounded-md border border-accent/30 bg-accent/10 p-3 text-[12px] text-accent">
          <strong>
            <Clock
              className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-accent"
              aria-hidden="true"
            />
            Queued:
          </strong>{" "}
          compaction request is recorded in repo metadata
        </div>
      ) : (
        <div className="mb-3.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12px] text-emerald-300">
          <strong>
            <Check
              className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-400"
              aria-hidden="true"
            />
            Idle:
          </strong>{" "}
          no compaction lease is currently active
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
        <div className="rounded-md border border-border bg-canvas p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">Receive Lease</div>
          <div className="font-mono text-fg">
            {state.receiveLease
              ? `active until ${new Date(state.receiveLease.expiresAt).toLocaleString()}`
              : "idle"}
          </div>
        </div>
        <div className="rounded-md border border-border bg-canvas p-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">Compaction</div>
          <div className="font-mono text-fg">{compactionStatus}</div>
          {compactionData?.wantedAt ? (
            <div className="mt-1 text-[11px] text-fgMuted">
              requested {new Date(compactionData.wantedAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 space-y-3.5">
        <div className="rounded-md border border-border bg-canvas p-3.5 text-[12px] text-fgBody">
          Compaction requests queue real background work. The active pack catalog and compaction
          lease are the source of truth for repository state.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void startCompaction(true)}
            disabled={pending["compaction-dry-run"]}
          >
            <Search className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            <span className="label">
              {pending["compaction-dry-run"] ? "Processing..." : "Preview Compaction"}
            </span>
          </Button>
          <Button
            type="button"
            onClick={() => void startCompaction(false)}
            disabled={pending["compaction-start"]}
          >
            <Play className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            <span className="label">
              {pending["compaction-start"] ? "Processing..." : "Request Compaction"}
            </span>
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void clearCompaction()}
            disabled={
              pending["compaction-clear"] || (!compactionData?.queued && !compactionData?.running)
            }
          >
            <Trash2 className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            <span className="label">
              {pending["compaction-clear"] ? "Clearing..." : "Clear Compaction Request"}
            </span>
          </Button>
        </div>
        {queuedCompactionAt ? (
          <div className="text-[12px] text-fgMuted">
            Latest request recorded at {queuedCompactionAt}.
          </div>
        ) : null}
        {compactionResult ? <JsonResult data={compactionResult} /> : null}
      </div>
    </Card>
  );
}
