import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

/** A lamp, as drawn: a 9px ring on a hairline; steel when lit, light steel while busy, hollow when off; half filled or ringed by `variant`. */
export function Led({
  lit = false,
  busy = false,
  variant,
  size = "md",
  label,
  className,
}: {
  readonly lit?: boolean;
  readonly busy?: boolean;
  /**
   * industry.css `.lamp.half` (half filled: under way) and `.lamp.ringed` (a heavier ring in the
   * alert ink: halted). Either wins over `lit` and `busy`.
   */
  readonly variant?: "half" | "ringed";
  /** Kept for call-site compatibility; lamps are mono. */
  readonly tone?: Tone | "key" | "busy";
  readonly size?: "sm" | "md";
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border transition-colors",
        size === "sm" ? "size-2" : "size-[9px]",
        variant === "ringed" ? "border-2 border-ink-alert bg-transparent" : "border-line",
        variant === "half" && "relative overflow-hidden bg-transparent after:absolute after:inset-y-0 after:left-0 after:w-1/2 after:bg-accent after:content-['']",
        variant === undefined && (busy ? "bg-accent-busy" : lit ? "bg-accent" : "bg-transparent"),
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export const Lamp = Led;
