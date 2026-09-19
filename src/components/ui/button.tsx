import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Size } from "@/types/ui";
import { cn } from "@/utils/cn";
import { Spinner } from "./spinner";

// Industry .btn, as drawn: Barlow Condensed 600 14px/1.2, 6.8px × 12.24px, square,
// hairline. The primary is the one solid object on the board. "run" and "key" are
// aliases kept for older call sites.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "key" | "run";

const PRIMARY = "border-accent-strong bg-accent-strong text-accent-ink hover:bg-accent-strong-hover active:bg-accent-strong-active";
const SECONDARY = "border-line bg-transparent text-ink-1 hover:bg-ink-1/7 active:bg-ink-1/14";

const VARIANT: Record<ButtonVariant, string> = {
  primary: PRIMARY,
  run: PRIMARY,
  secondary: SECONDARY,
  key: SECONDARY,
  ghost: "border-transparent bg-transparent px-[3.4px] text-accent-text hover:bg-accent/10 active:bg-accent/18",
  danger: "border-ink-alert bg-ink-alert text-ink-inverse hover:bg-ink-alert/90 active:bg-ink-alert/80",
};

// md is the sheet's natural button; sm and lg only set a height where a row needs one.
const SIZE: Record<Size, string> = {
  sm: "min-h-8 px-[10.2px] py-[5px] text-label",
  md: "px-[12.24px] py-[6.8px] text-sm",
  lg: "h-11 px-[12.24px] text-sm",
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
    "press relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border font-display font-semibold no-underline",
    "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
    SIZE[size],
    // After the size: a font-size class resets line height, so the drawn 1.2 must come last.
    "leading-[1.2]",
    VARIANT[variant],
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
