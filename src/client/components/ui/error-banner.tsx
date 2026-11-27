import type { ReactNode } from "react";

type ErrorBannerProps = {
  children: ReactNode;
  className?: string;
};

export function ErrorBanner({ children, className = "" }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`rounded-none border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-400 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
