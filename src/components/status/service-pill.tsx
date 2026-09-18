import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import type { ServiceStatus } from "@/services/service-status";
import { cn } from "@/utils/cn";

/** One line of service status, as enterprise footers carry it: a lamp and a plain sentence. Nothing internal. */
export function ServicePill({ status, className }: { readonly status: ServiceStatus; readonly className?: string }) {
  return (
    <p className={cn("m-0 inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-caps text-ink-1/78", className)}>
      <Led lit={status.overall === "operational"} size="sm" />
      <span>{messages.service.overall[status.overall]}</span>
    </p>
  );
}
