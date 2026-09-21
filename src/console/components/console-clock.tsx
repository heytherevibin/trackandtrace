"use client";

import { useEffect, useState } from "react";
import { consoleMessages } from "@/console/messages";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.frameSignedIn.clock;

const MINUTE_MS = 60_000;

/**
 * The signed-in masthead's clock (Main.dc.html:41): the figure, then the IST legend, shown only
 * once a member is signed in (ConsoleMasthead's `clock` slot). `formatTime` (@/utils/datetime) is
 * already fixed to Asia/Kolkata regardless of the viewer's own timezone (checked: `TIME_ZONE =
 * "Asia/Kolkata" as const`, passed explicitly to Intl.DateTimeFormat) -- so this needs no
 * IST-specific formatting of its own; a viewer anywhere still reads the console's own time.
 *
 * Hydration: the server and the client render at different instants, so the two texts genuinely
 * differ -- the same shape as watchlist-row.tsx's relative-time cell, and the same fix
 * (`suppressHydrationWarning` on the text node itself, not a mount-flag placeholder, which would
 * flash). React keeps the server-rendered text on screen through hydration; the first minute's
 * tick is what brings it current, same as the live page would anyway.
 */
export function ConsoleClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-baseline gap-2 px-2">
      <span suppressHydrationWarning className="font-data tnum text-label tracking-wide">
        {formatTime(now)}
      </span>
      <span className="legend-sm">{m.ist}</span>
    </span>
  );
}
