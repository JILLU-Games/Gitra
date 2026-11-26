import type { ComponentProps, ReactNode } from "react";

type CardVariant = "default" | "accent";

type CardProps = {
  variant?: CardVariant;
  interactive?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"div">, "children" | "className">;

const base = "rounded-md p-4";

const variantStyles: Record<CardVariant, string> = {
  default: "border border-border bg-surface",
  accent: "border border-border bg-surface",
};

const interactiveStyles = "hover:bg-surfaceHover/50 transition-colors cursor-pointer";

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
