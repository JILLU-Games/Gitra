import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<ComponentProps<"button">, keyof ButtonBaseProps> & {
    href?: never;
  };

type ButtonAsAnchor = ButtonBaseProps &
  Omit<ComponentProps<"a">, keyof ButtonBaseProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const shared =
  "inline-flex items-center justify-center gap-1.5 rounded-none no-underline whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-fg text-canvas font-semibold hover:bg-fgHover hover:text-canvas",
  secondary:
    "border border-border bg-canvas text-fgBody font-medium hover:bg-surfaceHover hover:text-fg",
  danger:
    "border border-red-500/30 bg-transparent text-red-400 font-medium hover:bg-red-500/10 hover:text-red-300",
  ghost:
    "border border-transparent bg-transparent text-fgBody font-medium hover:bg-surfaceHover hover:text-fg",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[12px]",
  md: "h-8 px-3.5 text-[12px]",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${shared} ${variants[variant]} ${sizes[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = `${shared} ${variants[variant]} ${sizes[size]} ${className}`.trim();

  if ("href" in rest && rest.href != null) {
    const { href, ...anchorRest } = rest as ButtonAsAnchor;
    return (
      <a href={href} className={classes} {...anchorRest}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...(rest as Omit<ButtonAsButton, keyof ButtonBaseProps>)}>
      {children}
    </button>
  );
}
