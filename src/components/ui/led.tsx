import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

/** A lamp, as drawn: a 9px ring on a hairline; steel when lit, light steel while busy, hollow when off. */
export function Led({
  lit = false,
  busy = false,
  size = "md",
  label,
  className,
}: {
  readonly lit?: boolean;
  readonly busy?: boolean;
  /** Kept for call-site compatibility; lamps are mono. */
  readonly tone?: Tone | "key" | "busy";
  readonly size?: "sm" | "md";
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border border-line transition-colors",
        size === "sm" ? "size-2" : "size-[9px]",
        busy ? "bg-accent-busy" : lit ? "bg-accent" : "bg-transparent",
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export const Lamp = Led;
