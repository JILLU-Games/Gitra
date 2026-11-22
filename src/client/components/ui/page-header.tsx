import type { ReactNode } from "react";

type PageHeaderProps = {
  children: ReactNode;
  className?: string;
};

export function PageHeader({ children, className = "" }: PageHeaderProps) {
  return (
    <div
      className={`mb-4 flex items-center justify-between max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
