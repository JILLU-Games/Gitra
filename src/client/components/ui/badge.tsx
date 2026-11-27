import type { ReactNode } from "react";

type BadgeVariant = "default" | "accent" | "success" | "error" | "warning";

type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-canvas text-fgMuted border border-border",
  accent: "bg-canvas text-fgBody border border-border",
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
  error: "bg-red-500/10 text-red-400 border border-red-500/25",
  warning: "bg-amber-500/10 text-amber-300 border border-amber-500/25",
};

export function badgeClasses(variant: BadgeVariant = "default"): string {
  return `inline-flex items-center rounded-none px-1.5 py-0.5 text-[11px] font-medium leading-4 ${variantStyles[variant]}`;
}

export function Badge({ variant = "default", className = "", children }: BadgeProps) {
  return <span className={`${badgeClasses(variant)} ${className}`.trim()}>{children}</span>;
}
