import type { TicketStatus } from "@/types/domain";
import { cn } from "@/utils/cn";
import { statusDescription, statusLabel } from "@/utils/status-tone";
import { Badge } from "./badge";

/** Reservation status as the sheet draws it: a steel-tint tag with the short label; the description rides along for assistive tech. */
export function StatusPill({
  status,
  position,
  live = false,
  className,
}: {
  readonly status: TicketStatus;
  readonly position?: number | null;
  /** Kept for call-site compatibility; tags have one size. */
  readonly size?: "sm" | "md";
  /** Announce changes to assistive tech. */
  readonly live?: boolean;
  readonly className?: string;
}) {
  const label = statusLabel(status, position);
  const description = statusDescription(status);
  return (
    <span className={cn("inline-flex", className)} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} aria-atomic={live ? "true" : undefined}>
      <Badge variant="accent" title={description} data-status={status}>
        {label}
      </Badge>
      <span className="sr-only">{description}</span>
    </span>
  );
}
