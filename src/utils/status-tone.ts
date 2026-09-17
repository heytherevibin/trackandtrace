import { messages } from "@/messages";
import type { TicketStatus } from "@/types/domain";
import type { Tone } from "@/types/ui";

/** Railway aspect for a reservation status. Colour is never the only carrier; pair with text. */
export function toneForStatus(status: string): Tone {
  if (status === "CNF") return "go";
  if (status === "RAC" || status === "WL") return "watch";
  if (status === "CANCELLED") return "stop";
  return "neutral";
}

/** "Confirmed", "RAC 12", "WL 34", "Cancelled", "Not found". */
export function statusLabel(status: TicketStatus, position?: number | null): string {
  if ((status === "RAC" || status === "WL") && typeof position === "number") {
    return messages.status.withPosition(status, position);
  }
  return messages.status.short[status];
}

export function statusDescription(status: TicketStatus): string {
  return messages.status.long[status];
}
