import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Size } from "@/types/ui";
import { cn } from "@/utils/cn";
import { Spinner } from "./spinner";

// Industry buttons: square, hairline, condensed. The primary is the one solid
// object on the board. "run" and "key" are aliases kept for older call sites.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "key" | "run";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-accent-strong bg-accent-strong text-accent-ink hover:border-accent-strong-hover hover:bg-accent-strong-hover active:bg-accent-strong-active",
  run: "border-accent-strong bg-accent-strong text-accent-ink hover:border-accent-strong-hover hover:bg-accent-strong-hover active:bg-accent-strong-active",
  secondary: "border-line bg-transparent text-ink-1 hover:bg-ink-1/7 active:bg-ink-1/14",
  key: "border-line bg-transparent text-ink-1 hover:bg-ink-1/7 active:bg-ink-1/14",
  ghost: "border-transparent bg-transparent text-accent-text hover:bg-accent/10 active:bg-accent/20",
  danger: "border-ink-alert bg-ink-alert text-ink-inverse hover:bg-ink-alert/90 active:bg-ink-alert/80",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-label",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-body",
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
    "press relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap border font-display font-semibold leading-tight no-underline",
    "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
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
      <span className={cn("inline-flex items-center gap-1.5", loading && "invisible")}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
});
