"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MINUTE_MS = 60_000;

/**
 * The sheet's "refreshes every minute": the server page re-reads its figures and the client keeps its
 * place. On the wall-clock minute, as ConsoleClock ticks, so the page's "Updated 14:32" and the
 * masthead's clock turn over together rather than drifting up to a minute apart.
 */
export function RefreshEveryMinute(): null {
  const router = useRouter();
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        router.refresh();
        interval = setInterval(() => router.refresh(), MINUTE_MS);
      },
      MINUTE_MS - (Date.now() % MINUTE_MS),
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [router]);
  return null;
}
