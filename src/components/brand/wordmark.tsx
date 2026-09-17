import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { Mark } from "./mark";

export function Wordmark({ compact = false, hideNameOnMobile = false, className }: { readonly compact?: boolean; readonly hideNameOnMobile?: boolean; readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Mark size={28} />
      <span className={cn("flex flex-col leading-none", hideNameOnMobile && "hidden sm:flex")}>
        <span className="font-display text-base font-bold uppercase text-ink-1">{messages.common.productName}</span>
        {!compact ? <span className="silk mt-1 text-ink-3">{messages.common.descriptor}</span> : null}
      </span>
    </span>
  );
}
