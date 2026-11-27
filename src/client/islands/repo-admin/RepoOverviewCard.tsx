import { useState } from "react";
import { Clipboard } from "lucide-react";
import { shortRefName } from "@/shared/git/ref-display";
import { copyToClipboard } from "@/client/components/ui";
import { Card } from "@/client/components/ui/card";
import { formatSampleBytes, shortValue } from "./format";
import type { AdminState } from "./types";

export type RepoOverviewCardProps = {
  storageSize: string;
  packCount: number;
  supersededPackCount: number;
  compactionStatus: string;
  state: AdminState;
  head?: { target?: string; unborn?: boolean };
  branchCount: number;
  tagCount: number;
};

export function RepoOverviewCard({
  storageSize,
  packCount,
  supersededPackCount,
  compactionStatus,
  state,
  head,
  branchCount,
  tagCount,
}: RepoOverviewCardProps) {
  const [copiedDoId, setCopiedDoId] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const activePackCount = Array.isArray(state.activePacks) ? state.activePacks.length : packCount;

  async function copyDoId(doId: string) {
    setCopyError(false);
    const copied = await copyToClipboard(doId, {
      label: "Durable Object ID",
      successTitle: "DO ID copied",
    });
    if (copied) {
      setCopiedDoId(true);
      window.setTimeout(() => setCopiedDoId(false), 1200);
    } else {
      setCopiedDoId(false);
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2000);
    }
  }

  return (
    <Card>
      <h2 className="mb-3.5 text-[14px] font-semibold text-fg">Repository Overview</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">
            R2 Packs Storage
          </div>
          <div className="font-mono text-[13px] text-fg">{storageSize || "0 bytes"}</div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">Active Packs</div>
          <div className="font-mono text-[13px] text-fg">
            {activePackCount}
            {supersededPackCount > 0 ? (
              <span className="ml-1 text-[11px] text-fgMuted">
                ({supersededPackCount} superseded)
              </span>
            ) : null}
          </div>
        </div>
        {state?.meta?.doId ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">
              Durable Object ID
            </div>
            <div className="relative font-mono text-[13px] text-fg">
              <span title={state.meta.doId}>{shortValue(String(state.meta.doId), 12)}</span>
              <button
                type="button"
                className="ml-2 inline-flex rounded-none border border-border bg-canvas p-1 text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
                title={copiedDoId ? "Copied" : copyError ? "Copy failed" : "Copy DO ID"}
                aria-label="Copy DO ID"
                onClick={() => void copyDoId(String(state.meta?.doId || ""))}
              >
                <Clipboard className="block h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {copiedDoId ? (
                <span className="ml-1.5 text-[11px] text-emerald-400">copied</span>
              ) : copyError ? (
                <span className="ml-1.5 text-[11px] text-red-400">copy failed</span>
              ) : null}
            </div>
          </div>
        ) : null}
        {state.looseR2SampleBytes ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">
              R2 Loose (sample)
            </div>
            <div className="font-mono text-[13px] text-fg">
              {formatSampleBytes(state.looseR2SampleBytes)}
              <span className="ml-1 text-[11px] text-fgMuted">
                ({state.looseR2SampleCount || 0} objs{state.looseR2Truncated ? ", truncated" : ""})
              </span>
            </div>
          </div>
        ) : null}
        {state.dbSizeBytes ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">
              Durable Object Storage
            </div>
            <div className="font-mono text-[13px] text-fg">
              {formatSampleBytes(state.dbSizeBytes)}
            </div>
          </div>
        ) : null}
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">Receive Lease</div>
          <div className="font-mono text-[13px] text-fg">
            {state.receiveLease ? "Active" : "Idle"}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">Compaction</div>
          <div className="font-mono text-[13px] text-accent">{compactionStatus}</div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">
            Catalog Version
          </div>
          <div className="font-mono text-[13px] text-fg">
            {typeof state.packCatalogVersion === "number" ? state.packCatalogVersion : "n/a"}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">HEAD</div>
          <div className="font-mono text-[13px] text-fg">
            {head?.target ? shortRefName(String(head.target)) : head?.unborn ? "unborn" : "unknown"}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-fgMuted">Branches/Tags</div>
          <div className="font-mono text-[13px] text-fg">
            {branchCount}/{tagCount}
          </div>
        </div>
      </div>
    </Card>
  );
}
