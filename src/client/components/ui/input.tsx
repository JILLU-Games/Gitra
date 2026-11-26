import type { ComponentProps } from "react";

type InputProps = {
  label?: string;
  helperText?: string;
  error?: string;
} & Omit<ComponentProps<"input">, "className">;

const inputClasses =
  "h-8 w-full rounded-md border border-border bg-canvas px-3 text-[13px] text-fg placeholder:text-fgMuted focus:border-fgMuted focus:outline-none";

const errorInputClasses =
  "h-8 w-full rounded-md border border-red-500/50 bg-canvas px-3 text-[13px] text-fg placeholder:text-fgMuted focus:border-red-500 focus:outline-none";

export function Input({ label, helperText, error, id, ...rest }: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-[12px] font-medium text-fgBody">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={error ? errorInputClasses : inputClasses}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-[12px] text-red-400">
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-1 text-[12px] text-fgMuted">{helperText}</p>
      ) : null}
    </div>
  );
}
