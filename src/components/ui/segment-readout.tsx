import { cn } from "@/utils/cn";

const SIZE = { sm: "text-body", md: "text-lg", lg: "text-2xl" } as const;

/** A figure readout in condensed tabular digits; a dash renders as a dim empty slot. */
export function SegmentReadout({
  value,
  label,
  size = "md",
  className,
}: {
  readonly value: string;
  /** Accessible name; the glyphs themselves are decorative. */
  readonly label: string;
  readonly size?: keyof typeof SIZE;
  readonly className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={cn("font-data inline-flex items-center tracking-brand text-ink-1", SIZE[size], className)}>
      {[...value].map((char, i) => (
        <span key={i} data-char={char} aria-hidden="true" className={cn("flex justify-center", char === " " ? "w-1.5" : "min-w-2", char === "-" && "text-ink-3")}>
          {char === "-" ? "·" : char}
        </span>
      ))}
    </span>
  );
}
