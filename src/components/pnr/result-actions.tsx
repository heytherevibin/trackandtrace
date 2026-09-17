"use client";

import { ArrowSyncRegular, BookmarkFilled, BookmarkRegular, ShareRegular } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages";

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
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing} leadingIcon={<ArrowSyncRegular className="size-4" aria-hidden="true" />} data-testid="refresh">
        {m.refresh}
      </Button>
      <Button variant="secondary" size="sm" onClick={onShare} leadingIcon={<ShareRegular className="size-4" aria-hidden="true" />} data-testid="share-result">
        {m.share}
      </Button>
      <Button
        variant={saved ? "secondary" : "key"}
        size="sm"
        onClick={onToggleSave}
        loading={saving}
        aria-pressed={saved}
        leadingIcon={saved ? <BookmarkFilled className="size-4" aria-hidden="true" /> : <BookmarkRegular className="size-4" aria-hidden="true" />}
        data-testid="save-watchlist"
      >
        {saved ? m.saved : m.save}
      </Button>
    </div>
  );
}
