"use client";

import { Suspense } from "react";
import { COUNT_CHIP } from "./nav-config";
import { useWatchCount } from "./use-watch-count";

function Count({ className }: { readonly className?: string }) {
  const n = useWatchCount();
  return n > 0 ? (
    <span aria-hidden="true" className={className ?? COUNT_CHIP}>
      {n}
    </span>
  ) : null;
}

/** The saved count beside Watchlist (v4), wherever Watchlist is drawn. Decorative: the link keeps its plain name. */
export function WatchCountChip({ className }: { readonly className?: string }) {
  return (
    <Suspense fallback={null}>
      <Count className={className} />
    </Suspense>
  );
}
