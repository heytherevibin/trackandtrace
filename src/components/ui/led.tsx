import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

const LIT: Record<Tone | "key" | "busy", string> = {
  go: "bg-accent",
  watch: "bg-accent",
  key: "bg-accent",
  busy: "bg-accent-busy",
  stop: "bg-ink-alert",
  neutral: "bg-ink-3",
};

/** A lamp: a hollow ring when off, a steel fill when on. Decorative unless labelled; adjacent text carries the meaning. */
export function Led({
  tone = "neutral",
  lit = false,
  size = "md",
  label,
  className,
}: {
  readonly tone?: Tone | "key" | "busy";
  readonly lit?: boolean;
  readonly size?: "sm" | "md" | "lg";
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border border-line-strong transition-colors",
        size === "sm" ? "size-1.5" : size === "lg" ? "size-3" : "size-2",
        lit ? LIT[tone] : "bg-transparent",
        className,
      )}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export const Lamp = Led;
