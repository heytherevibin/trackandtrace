"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages";

/** Re-runs the query for this page (onRefresh, or the server render). Optionally gated by a retry-after countdown. */
export function RefreshButton({
  retryAfter = 0,
  label = messages.common.retry,
  onRefresh,
}: {
  readonly retryAfter?: number;
  readonly label?: string;
  readonly onRefresh?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState(retryAfter);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((r) => r - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [remaining]);
  return (
    <Button variant="primary" loading={pending} disabled={remaining > 0} onClick={() => startTransition(() => (onRefresh ? onRefresh() : router.refresh()))} data-testid="retry">
      {remaining > 0 ? messages.states.rateLimited.retryIn(remaining) : label}
    </Button>
  );
}
