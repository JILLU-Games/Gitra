import type { ComponentProps, ReactNode } from "react";

type CardVariant = "default" | "accent";

type CardProps = {
  variant?: CardVariant;
  interactive?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "className">;

const base = "rounded-lg p-4 sm:p-5";

const variantStyles: Record<CardVariant, string> = {
  default:
    "border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60",
  accent:
    "border border-accent-500/30 bg-white dark:bg-zinc-900/70",
};

const interactiveStyles = "hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer";

export function Card({
  variant = "default",
  interactive = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  const classes =
    `${base} ${variantStyles[variant]} ${interactive ? interactiveStyles : ""} ${className}`.trim();

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
