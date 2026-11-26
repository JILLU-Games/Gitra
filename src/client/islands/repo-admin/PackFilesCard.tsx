import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { Card } from "@/client/components/ui/card";
import { formatSampleBytes, shortValue } from "./format";
import type { PackStat } from "./types";

export type PackFilesCardProps = {
  packCount: number;
  packStats: PackStat[];
  pending: Record<string, boolean>;
  removePack: (packName: string) => Promise<void>;
};

function packKindLabel(kind: PackStat["kind"]): string {
  switch (kind) {
    case "compact":
      return "compact";
    case "receive":
      return "receive";
    default:
      return "legacy";
  }
}

function PackRow({
  packStat,
  pending,
  removePack,
}: {
  packStat: PackStat;
  pending: Record<string, boolean>;
  removePack: (packName: string) => Promise<void>;
}) {
  const packName = String(packStat.key).split("/").pop() || packStat.key;
  const canDelete = packStat.state === "superseded";
  // Mirror the Index cell's icon-only treatment. The .refs sidecar is either present,
  // missing, or its status couldn't be determined — all descriptive context lives in
  // the tooltip so the table stays visually consistent across rows.
  const refStatus = packStat.refIndexStatus ?? "unknown";
  const refSizeSuffix =
    refStatus === "present" && typeof packStat.refIndexSize === "number"
      ? ` (${formatSampleBytes(packStat.refIndexSize)})`
      : "";
  const refTitle =
    refStatus === "present"
      ? `Reference sidecar is present in R2${refSizeSuffix}`
      : refStatus === "missing"
        ? "Reference sidecar is missing from R2"
        : "Reference sidecar status could not be checked";

  return (
    <tr className="border-b border-borderSubtle">
      <td className="py-2 font-mono text-[12px] text-fg">
        <span title={packStat.key}>{shortValue(packName, 35)}</span>
      </td>
      <td className="py-2">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
            packStat.state === "active"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-border bg-canvas text-fgMuted"
          }`}
        >
          {packStat.state}
        </span>
      </td>
      <td className="py-2 text-[12px] text-fgBody">{packKindLabel(packStat.kind)}</td>
      <td className="py-2 text-right font-mono text-[12px] text-fgBody">{packStat.tier}</td>
      <td className="py-2 text-right font-mono text-[12px] text-fgBody">{packStat.objectCount}</td>
      <td className="py-2 text-right font-mono text-[12px] text-fgBody">
        {formatSampleBytes(packStat.packSize)}
      </td>
      <td className="py-2 text-right font-mono text-[12px] text-fgBody">
        {formatSampleBytes(packStat.indexSize)}
      </td>
      <td className="py-2 text-center">
        {packStat.hasIndex ? (
          <Check className="inline h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        ) : (
          <X className="inline h-3.5 w-3.5 text-red-400" aria-hidden="true" />
        )}
      </td>
      <td className="py-2 text-center" title={refTitle}>
        {refStatus === "present" ? (
          <Check className="inline h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        ) : refStatus === "missing" ? (
          <X className="inline h-3.5 w-3.5 text-red-400" aria-hidden="true" />
        ) : (
          <span className="inline-block font-mono text-[12px] text-fgMuted" aria-hidden="true">
            ?
          </span>
        )}
      </td>
      <td className="py-2 text-center">
        <button
          type="button"
          className="rounded p-1 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            canDelete
              ? "Delete this superseded pack"
              : "Active packs cannot be deleted during normal operation"
          }
          aria-label="Delete pack"
          onClick={() => void removePack(packName)}
          disabled={!canDelete || pending[`remove-pack:${packName}`]}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

export function PackFilesCard({ packCount, packStats, pending, removePack }: PackFilesCardProps) {
  // Superseded rows are hidden by default so the handful of active packs aren't
  // buried under compaction history. The toggle only appears when there's
  // something to reveal.
  const [showSuperseded, setShowSuperseded] = useState(false);

  if (packStats.length === 0 && packCount === 0) {
    return null;
  }

  if (packStats.length === 0 && packCount > 0) {
    return (
      <Card>
        <h2 className="mb-2 text-[14px] font-semibold text-fg">Pack Catalog</h2>
        <p className="text-[13px] text-fgBody">
          {packCount} pack rows exist but detailed catalog data was not loaded.
        </p>
      </Card>
    );
  }

  const activeRows = packStats.filter((p) => p.state === "active");
  const supersededRows = packStats.filter((p) => p.state === "superseded");
  const hasSuperseded = supersededRows.length > 0;
  const headerCount =
    hasSuperseded && showSuperseded
      ? `${activeRows.length} active, ${supersededRows.length} superseded`
      : `${activeRows.length} active`;

  return (
    <Card>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-fg">Pack Catalog ({headerCount})</h2>
        {hasSuperseded ? (
          <button
            type="button"
            onClick={() => setShowSuperseded((prev) => !prev)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-canvas px-2.5 text-[12px] text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
            aria-expanded={showSuperseded}
          >
            {showSuperseded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                Hide superseded history
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                Show superseded history ({supersededRows.length})
              </>
            )}
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 text-left">Pack Name</th>
              <th className="py-2 text-left">State</th>
              <th className="py-2 text-left">Kind</th>
              <th className="py-2 text-right">Tier</th>
              <th className="py-2 text-right">Objects</th>
              <th className="py-2 text-right">Pack Size</th>
              <th className="py-2 text-right">Index Size</th>
              <th className="py-2 text-center">Index</th>
              <th className="py-2 text-center">Refs</th>
              <th className="py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((packStat) => (
              <PackRow
                key={packStat.key}
                packStat={packStat}
                pending={pending}
                removePack={removePack}
              />
            ))}
            {showSuperseded && hasSuperseded ? (
              <>
                {activeRows.length > 0 ? (
                  <tr className="border-b border-border">
                    <td
                      colSpan={10}
                      className="py-1 text-center text-[11px] uppercase tracking-wide text-fgMuted"
                    >
                      superseded history
                    </td>
                  </tr>
                ) : null}
                {supersededRows.map((packStat) => (
                  <PackRow
                    key={packStat.key}
                    packStat={packStat}
                    pending={pending}
                    removePack={removePack}
                  />
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
