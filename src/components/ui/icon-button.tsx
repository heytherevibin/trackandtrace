import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Spinner } from "./spinner";

type Variant = "ghost" | "secondary" | "key";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  ghost: "press bg-transparent text-ink-1 border border-transparent hover:bg-surface-2",
  secondary: "press bg-surface-2 text-ink-1 border border-line-strong hover:bg-surface-3",
  key: "key-cap bg-key-cap text-key-cap-ink border border-line-strong",
};
const SIZE: Record<Size, string> = { sm: "size-9", md: "size-10", lg: "size-11" };

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
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50", VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : icon}
    </button>
  );
});
