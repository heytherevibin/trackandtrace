import { messages } from "@/messages";
import type { PnrResult } from "@/types/domain";
import { formatPnr } from "@/utils/pnr";
import { statusLabel } from "@/utils/status-tone";

export function buildShareUrl(origin: string, pnr: string): string {
  return `${origin}/pnr/${pnr}`;
}

export function buildShareText(result: PnrResult): string {
  const s = result.snapshot;
  return `PNR ${formatPnr(s.pnr)} · ${s.train.number} ${s.train.name} · ${statusLabel(result.lead.status, result.lead.position)} · ${messages.common.productName}`;
}

export type ShareOutcome = "shared" | "copied" | "failed";

type ShareNavigator = Pick<Navigator, "share" | "canShare" | "clipboard">;

/** Native share sheet when available, clipboard otherwise. Never throws. */
export async function shareOrCopy(payload: { readonly title: string; readonly text: string; readonly url: string }, nav: ShareNavigator): Promise<ShareOutcome> {
  try {
    if (typeof nav.share === "function" && (typeof nav.canShare !== "function" || nav.canShare(payload))) {
      await nav.share(payload);
      return "shared";
    }
  } catch {
    // fall through to the clipboard when the sheet is dismissed or unsupported
  }
  try {
    if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
      await nav.clipboard.writeText(payload.url);
      return "copied";
    }
  } catch {
    // clipboard denied
  }
  return "failed";
}
