import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

/** A lamp, as drawn: a 9px ring on a hairline; steel when lit, light steel while busy, hollow when off; half filled or ringed by `variant`. */
export function Led({
  lit = false,
  busy = false,
  alert = false,
  variant,
  size = "md",
  label,
  className,
}: {
  readonly lit?: boolean;
  readonly busy?: boolean;
  /** Neubrutal v4's red lamp: the digits were refused. */
  readonly alert?: boolean;
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
        // Neubrutal v4 .lamp: 12px, 2px edge; lime when good, orange (blinking) while running.
        "nb:border-2 nb:border-edge",
        size === "sm" ? "nb:size-2" : "nb:size-3",
        variant === undefined && (busy ? "nb:bg-orange nb-blink" : lit ? "nb:bg-lime" : alert ? "nb:bg-red" : "nb:bg-transparent"),
        variant === "half" && "nb:after:bg-orange",
        variant === "ringed" && "nb:border-red",
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export const Lamp = Led;
