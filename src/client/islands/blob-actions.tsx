/// <reference lib="dom" />

import { useState } from "react";
import { Clipboard, Download, FileText, Menu } from "lucide-react";

import { hydrateIsland } from "@/client/hydrate";
import { Button, buttonClasses, copyToClipboard, showToast } from "@/client/components/ui";

export type BlobActionsProps = {
  viewRawHref: string;
  rawHref: string;
  showCopy: boolean;
  isImage?: boolean;
  isPdf?: boolean;
};

export function BlobActionsIsland({
  viewRawHref,
  rawHref,
  showCopy,
  isImage,
  isPdf,
}: BlobActionsProps) {
  const [copyLabel, setCopyLabel] = useState("Copy");

  async function copyRawText() {
    try {
      const response = await fetch(viewRawHref);
      if (!response.ok) {
        showToast({
          tone: "error",
          title: "Could not load raw file",
          message: `Server returned HTTP ${response.status}.`,
        });
        return;
      }
      const text = await response.text();
      const copied = await copyToClipboard(text, {
        label: "file contents",
        successTitle: "File contents copied",
      });
      if (copied) {
        setCopyLabel("Copied");
        window.setTimeout(() => setCopyLabel("Copy"), 1200);
      }
    } catch {
      showToast({
        tone: "error",
        title: "Copy failed",
        message: "Network error while loading raw file contents.",
      });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        <div className="inline-flex h-7 items-center overflow-hidden rounded-none border border-border bg-canvas text-[12px]">
          {showCopy ? (
            <button
              className="h-full px-2.5 font-medium text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              type="button"
              onClick={() => void copyRawText()}
            >
              {copyLabel}
            </button>
          ) : null}
          {!isImage && !isPdf ? (
            <a
              className="inline-flex h-full items-center border-l border-border px-2.5 font-medium text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              href={viewRawHref}
            >
              View
            </a>
          ) : null}
          <span className="inline-flex h-full items-center border-l border-border bg-surface px-2.5 text-fgMuted">
            Raw
          </span>
        </div>
        <Button size="sm" variant="secondary" href={rawHref}>
          Download
        </Button>
      </div>
      <div className="sm:hidden">
        <details className="ref-menu relative">
          <summary className={buttonClasses("secondary", "sm")}>
            <Menu className="h-3.5 w-3.5" aria-hidden="true" />
          </summary>
          <div className="fixed inset-x-0 z-20 mx-3 mt-1.5 rounded-none border border-border bg-surface p-1.5 text-[12px]">
            <div className="flex flex-col">
              {showCopy ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-none px-3 py-1.5 text-left text-fgBody hover:bg-surfaceHover hover:text-fg"
                  onClick={() => void copyRawText()}
                >
                  <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{copyLabel === "Copy" ? "Copy raw" : "Copied"}</span>
                </button>
              ) : null}
              {!isImage && !isPdf ? (
                <a
                  href={viewRawHref}
                  className="flex items-center gap-2 rounded-none px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>View raw</span>
                </a>
              ) : null}
              <a
                href={rawHref}
                className="flex items-center gap-2 rounded-none px-3 py-1.5 text-fgBody no-underline hover:bg-surfaceHover hover:text-fg"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download</span>
              </a>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

export function initBlobActions() {
  hydrateIsland<BlobActionsProps>("blob-actions", BlobActionsIsland);
}
