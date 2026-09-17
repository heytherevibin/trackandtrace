import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

const LIT: Record<Tone | "key", string> = {
  go: "led-go",
  watch: "led-watch",
  stop: "led-stop",
  neutral: "bg-ink-2",
  key: "led-key",
};

/** A panel lamp. Decorative unless given a label; text next to it carries the meaning. */
export function Led({
  tone = "neutral",
  lit = false,
  size = "md",
  label,
  className,
}: {
  readonly tone?: Tone | "key";
  readonly lit?: boolean;
  readonly size?: "sm" | "md" | "lg";
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn("led shrink-0", size === "sm" && "size-1.5", size === "lg" && "size-3", lit && LIT[tone], className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
