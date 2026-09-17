import type { TicketStatus } from "@/types/domain";
import { cn } from "@/utils/cn";
import { statusDescription, statusLabel, toneForStatus } from "@/utils/status-tone";
import { Badge } from "./badge";
import { Led } from "./led";

/** Reservation status as lamp plus text. The text carries the meaning; the lamp confirms it. */
export function StatusPill({
  status,
  position,
  size = "md",
  live = false,
  className,
}: {
  readonly status: TicketStatus;
  readonly position?: number | null;
  readonly size?: "sm" | "md";
  /** Announce changes to assistive tech. */
  readonly live?: boolean;
  readonly className?: string;
}) {
  const tone = toneForStatus(status);
  const label = statusLabel(status, position);
  const description = statusDescription(status);
  return (
    <span className={cn("inline-flex", className)} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} aria-atomic={live ? "true" : undefined}>
      <Badge tone={tone} size={size} icon={<Led tone={tone} lit size="sm" />} title={description} data-status={status}>
        {label}
      </Badge>
      <span className="sr-only">{description}</span>
    </span>
  );
}
