import { cn } from "@/utils/cn";

const SIZE = { sm: "h-6 px-2 text-sm", md: "h-8 px-3 text-base", lg: "h-10 px-3 text-lg" } as const;

/** A quiet digit readout: sunken chip, tabular mono, dim slots for what is not yet typed. */
export function SegmentReadout({
  value,
  label,
  size = "md",
  className,
}: {
  /** Digits, spaces, dashes, and colons; a dash renders as a dim empty slot. */
  readonly value: string;
  /** Accessible name; the glyphs themselves are decorative. */
  readonly label: string;
  readonly size?: keyof typeof SIZE;
  readonly className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("font-data inline-flex items-center rounded-md border border-line bg-surface-sunken font-medium tracking-wide text-ink-1 shadow-key-pressed", SIZE[size], className)}
    >
      {[...value].map((char, i) => (
        <span key={i} data-char={char} aria-hidden="true" className={cn("flex justify-center", char === " " ? "w-2" : "min-w-3", char === "-" && "text-ink-3")}>
          {char === "-" ? "·" : char}
        </span>
      ))}
    </span>
  );
}
