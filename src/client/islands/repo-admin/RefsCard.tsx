import { RefreshCw } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { classifyRef, shortRefName } from "@/shared/git/ref-display";
import { shortValue } from "./format";

export type RefsCardProps = {
  refs: Array<{ name: string; oid: string }>;
};

export function RefsCard({ refs }: RefsCardProps) {
  return (
    <Card>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-fg">References</h2>
        <Button size="sm" type="button" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
          <span className="label">Refresh All</span>
        </Button>
      </div>
      {refs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left">Reference Name</th>
                <th className="py-2 text-left">Target OID</th>
                <th className="py-2 text-left">Type</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((ref) => {
                const kind = classifyRef(ref.name);

                return (
                  <tr key={ref.name} className="border-b border-borderSubtle">
                    <td className="py-2 font-mono text-[12px] text-fg">{shortRefName(ref.name)}</td>
                    <td className="py-2 font-mono text-[12px] text-fgMuted">
                      <span title={ref.oid}>{shortValue(ref.oid, 12)}</span>
                    </td>
                    <td className="py-2">
                      <span
                        className={`rounded-none border px-1.5 py-0.5 font-mono text-[11px] ${
                          kind === "branch"
                            ? "border-accent/30 bg-accent/10 text-accent"
                            : kind === "tag"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-border bg-canvas text-fgBody"
                        }`}
                      >
                        {kind === "branch"
                          ? "branch"
                          : kind === "tag"
                            ? "tag"
                            : ref.name.split("/")[0]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[12px] italic text-fgMuted">No references found</p>
      )}
    </Card>
  );
}
