import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface Fact {
  readonly label: string;
  readonly value: ReactNode;
}

const VALUE = { sm: "text-base", md: "text-lead", lg: "text-2xl" } as const;

/**
 * Legend over figure, in cells that wrap by width. `framed` draws the terminal's
 * boxed grid (hairline cells); unframed is the open row under a state block.
 */
export function FactGrid({
  items,
  size = "md",
  framed = false,
  className,
}: {
  readonly items: readonly Fact[];
  readonly size?: keyof typeof VALUE;
  readonly framed?: boolean;
  readonly className?: string;
}) {
  return (
    <dl className={cn("fact-grid", framed ? "grid-cols-[repeat(auto-fit,minmax(110px,1fr))] overflow-hidden border border-line" : "gap-3", className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", framed && "-mt-px border-t border-line px-3.5 py-2.5")}>
          <dt className="legend-sm">{item.label}</dt>
          <dd className={cn("font-data tracking-head text-ink-1", VALUE[size])}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
