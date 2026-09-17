import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { Mark } from "./mark";

/** Mark plus the name in condensed capitals; the descriptor sits under it where there is room. */
export function Wordmark({ descriptor = false, hideNameOnMobile = false, className }: { readonly descriptor?: boolean; readonly hideNameOnMobile?: boolean; readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark size={24} />
      <span className={cn("flex flex-col leading-tight", hideNameOnMobile && "hidden sm:flex")}>
        <span className={cn("font-display font-semibold uppercase tracking-brand text-ink-1", descriptor ? "text-lead" : "text-lg")}>{messages.common.productName}</span>
        {descriptor ? <span className="legend-sm">{messages.common.descriptor}</span> : null}
      </span>
    </span>
  );
}
