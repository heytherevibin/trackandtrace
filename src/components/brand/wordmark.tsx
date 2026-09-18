import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { Mark } from "./mark";

const NAME_FROM = { sm: "hidden sm:flex", lg: "hidden lg:flex" } as const;

/**
 * Mark plus the name in condensed capitals; the descriptor sits under it where there is room.
 * `nameFrom` shows the name only from that breakpoint (the mark alone below it).
 */
export function Wordmark({ descriptor = false, nameFrom, className }: { readonly descriptor?: boolean; readonly nameFrom?: keyof typeof NAME_FROM; readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark size={24} />
      <span className={cn("flex flex-col leading-tight", nameFrom && NAME_FROM[nameFrom])}>
        <span className={cn("font-display font-semibold uppercase tracking-brand text-ink-1", descriptor ? "text-lead" : "text-lg")}>{messages.common.productName}</span>
        {descriptor ? <span className="legend-sm">{messages.common.descriptor}</span> : null}
      </span>
    </span>
  );
}
