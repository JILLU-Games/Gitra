import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { copyToClipboard } from "@/client/components/ui";

export function JsonResult({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const serialized = JSON.stringify(data, null, 2);

  async function copyJson() {
    setCopyError(false);
    const ok = await copyToClipboard(serialized, {
      label: "JSON payload",
      successTitle: "JSON copied",
    });
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } else {
      setCopied(false);
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2000);
    }
  }

  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-none border border-border bg-canvas p-3.5 pr-12 font-mono text-[12px] text-fgBody">
        {serialized}
      </pre>
      <button
        type="button"
        onClick={() => void copyJson()}
        className="absolute right-2 top-2 rounded-none border border-border bg-surface p-1.5 text-fgBody transition-colors hover:bg-surfaceHover hover:text-fg"
        title={copied ? "Copied" : copyError ? "Copy failed" : "Copy JSON"}
        aria-label={copied ? "Copied JSON" : copyError ? "Copy JSON failed" : "Copy JSON"}
      >
        {copied ? (
          <Check className="block h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        ) : (
          <Clipboard className="block h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      {copyError ? (
        <p role="alert" className="m-0 mt-1 text-[11px] text-red-400">
          Clipboard copy failed — select and copy manually.
        </p>
      ) : null}
    </div>
  );
}
