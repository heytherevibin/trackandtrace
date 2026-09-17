import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Size } from "@/types/ui";
import { cn } from "@/utils/cn";
import { Spinner } from "./spinner";

// Buttons in the panel's vocabulary: silkscreen legends on flat plates, or a
// physical key cap for the actions the machine is about (Run).

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "key" | "run";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "press bg-accent text-accent-ink border border-accent hover:bg-accent-hover hover:border-accent-hover",
  secondary: "press bg-surface-2 text-ink-1 border border-line-strong hover:bg-surface-3",
  ghost: "press bg-transparent text-ink-1 border border-transparent hover:bg-surface-2",
  danger: "press bg-surface-2 text-stop border border-stop-line hover:bg-stop-bg",
  key: "press bg-surface-2 text-ink-1 border border-line-strong shadow-key hover:bg-surface-3",
  run: "press bg-accent text-accent-ink border border-accent shadow-key hover:bg-accent-hover",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonStyleOptions {
  readonly variant?: ButtonVariant;
  readonly size?: Size;
  readonly fullWidth?: boolean;
  readonly className?: string;
}

/** Shared classes so links can dress as buttons without nesting interactive elements. */
export function buttonClassName({ variant = "secondary", size = "md", fullWidth = false, className }: ButtonStyleOptions = {}): string {
  return cn(
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-label font-semibold uppercase tracking-wide",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    fullWidth && "w-full",
    className,
  );
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">, ButtonStyleOptions {
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
  readonly children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, loading = false, leadingIcon, trailingIcon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" />
        </span>
      ) : null}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
});
