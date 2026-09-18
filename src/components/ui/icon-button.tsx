import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Spinner } from "./spinner";

type Variant = "ghost" | "secondary" | "key";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  ghost: "border-transparent text-accent-text hover:bg-accent/10 active:bg-accent/20",
  secondary: "border-line text-ink-1 hover:bg-ink-1/7 active:bg-ink-1/14",
  key: "border-line text-ink-1 hover:bg-ink-1/7 active:bg-ink-1/14",
};
const SIZE: Record<Size, string> = { sm: "size-8", md: "size-9", lg: "size-11" };

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Required: becomes the accessible name. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", loading = false, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("press inline-flex shrink-0 items-center justify-center border bg-transparent disabled:cursor-not-allowed disabled:opacity-45", VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : icon}
    </button>
  );
});
