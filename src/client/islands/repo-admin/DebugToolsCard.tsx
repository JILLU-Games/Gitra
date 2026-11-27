import { useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { inputClasses } from "@/client/components/ui/input";
import { JsonResult } from "./JsonResult";

export type DebugToolsCardProps = {
  oidResult: unknown;
  oidError?: string | null;
  stateDump: unknown;
  pending: Record<string, boolean>;
  checkOid: (oid: string) => Promise<void>;
  dumpState: () => Promise<void>;
};

export function DebugToolsCard({
  oidResult,
  oidError,
  stateDump,
  pending,
  checkOid,
  dumpState,
}: DebugToolsCardProps) {
  const [debugOid, setDebugOid] = useState("");

  return (
    <Card>
      <h2 className="mb-3.5 text-[14px] font-semibold text-fg">Debug Tools</h2>
      <div className="space-y-3.5">
        <div>
          <label htmlFor="debug-oid" className="mb-1.5 block text-[12px] font-medium text-fgBody">
            Check Object ID Existence
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="debug-oid"
              placeholder="Enter 40-character SHA-1 hash"
              className={`min-w-0 flex-1 font-mono ${inputClasses}`}
              pattern="[a-f0-9]{40}"
              aria-invalid={oidError ? true : undefined}
              value={debugOid}
              onChange={(event) => setDebugOid(event.target.value)}
            />
            <Button
              type="button"
              onClick={() => void checkOid(debugOid)}
              disabled={pending["check-oid"]}
            >
              {pending["check-oid"] ? "Checking..." : "Check OID"}
            </Button>
          </div>
          {oidError ? (
            <p role="alert" className="m-0 mt-1.5 text-[12px] text-red-400">
              {oidError}
            </p>
          ) : null}
          {oidResult ? <JsonResult data={oidResult} /> : null}
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-fgBody">
            Repository State Dump
          </label>
          <Button type="button" onClick={() => void dumpState()} disabled={pending["dump-state"]}>
            <Database className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            <span className="label">
              {pending["dump-state"] ? "Processing..." : "View DO State"}
            </span>
          </Button>
          {stateDump ? <JsonResult data={stateDump} /> : null}
        </div>
      </div>
    </Card>
  );
}
