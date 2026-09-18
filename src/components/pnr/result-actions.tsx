"use client";

import { Button } from "@/components/ui/button";
import { messages } from "@/messages";

/** The title block's actions, as the sheets draw them: hairline Refresh and Share, then Save as the one solid object. */
export function ResultActions({
  refreshing,
  onRefresh,
  onShare,
  saved,
  saving,
  onToggleSave,
}: {
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly onShare: () => void;
  readonly saved: boolean;
  readonly saving: boolean;
  readonly onToggleSave: () => void;
}) {
  const m = messages.result.actions;
  return (
    <>
      <Button variant="secondary" onClick={onRefresh} loading={refreshing} data-testid="refresh">
        {m.refresh}
      </Button>
      <Button variant="secondary" onClick={onShare} data-testid="share-result">
        {m.share}
      </Button>
      <Button variant={saved ? "secondary" : "primary"} onClick={onToggleSave} loading={saving} aria-pressed={saved} data-testid="save-watchlist">
        {saved ? m.saved : m.save}
      </Button>
    </>
  );
}
