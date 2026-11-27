import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  detail?: string;
  large?: boolean;
};

export function EmptyState({ icon, title, detail, large = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${large ? "gap-2.5 py-8" : "gap-1.5 py-5"}`}
    >
      <span
        className={`inline-grid place-items-center rounded-none border border-border bg-canvas text-fgMuted ${large ? "h-10 w-10" : "h-8 w-8"}`}
      >
        {icon}
      </span>
      <p className="mb-0 text-[13px] font-medium text-fg">{title}</p>
      {detail ? <p className="mb-0 text-[12px] text-fgMuted">{detail}</p> : null}
    </div>
  );
}
