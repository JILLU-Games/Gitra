import type { ReactNode } from "react";

type BadgeVariant = "default" | "accent" | "success" | "error" | "warning";

type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700",
  accent: "bg-accent-500/10 text-accent-700 dark:text-accent-400 border border-accent-500/25",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25",
  error: "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/25",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25",
};

export function Badge({ variant = "default", className = "", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium leading-4 ${variantStyles[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
