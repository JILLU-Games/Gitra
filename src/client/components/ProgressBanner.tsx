import { Download, Layers3 } from "lucide-react";

export type Progress = {
  state: "receiving" | "compacting";
  startedAt?: number;
  expiresAt?: number;
} | null;

type ProgressBannerProps = {
  progress?: Progress;
};

export function ProgressBanner({ progress }: ProgressBannerProps) {
  if (!progress) {
    return null;
  }

  if (progress.state === "receiving") {
    return (
      <div className="mb-4 rounded-none border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-300">
        <Download
          className="mr-2 inline h-3.5 w-3.5 align-[-2px] text-amber-400"
          aria-hidden="true"
        />
        Receiving push...
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-none border border-border bg-surface px-3.5 py-2.5 text-[13px] text-fgBody">
      <Layers3 className="mr-2 inline h-3.5 w-3.5 align-[-2px] text-fgMuted" aria-hidden="true" />
      Compacting packs...
    </div>
  );
}
