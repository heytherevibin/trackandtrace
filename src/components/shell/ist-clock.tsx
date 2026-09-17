"use client";

import { useEffect, useState } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/datetime";

interface Tick {
  readonly time: string | null;
  readonly turned: boolean;
}

/**
 * The platform clock, as drawn: condensed figures at .06em (15px in footers, 20px in a hairline
 * box on the sources board) with an 11px IST legend; the minute flips over when it turns.
 * Renders "--:--" until mounted so server HTML matches.
 */
export function IstClock({ size = "sm", framed = false, className }: { readonly size?: "sm" | "md"; readonly framed?: boolean; readonly className?: string }) {
  const [tick, setTick] = useState<Tick>({ time: null, turned: false });
  useEffect(() => {
    const read = () =>
      setTick((prev) => {
        const next = formatTime(new Date());
        return next === prev.time ? prev : { time: next, turned: prev.time !== null };
      });
    read();
    const timer = window.setInterval(read, 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const time = tick.time ?? "--:--";
  return (
    <span
      role="img"
      aria-label={`${time} ${messages.common.ist}`}
      className={cn("inline-flex gap-2", framed ? "items-center border border-line px-3 py-1.5" : "items-baseline", className)}
    >
      <span key={time} aria-hidden="true" className={cn("font-data inline-block tracking-brand", size === "md" ? "text-xl" : "text-body", tick.turned && "flip")}>
        {time}
      </span>
      <span aria-hidden="true" className="font-display text-2xs font-semibold uppercase tracking-caps text-ink-1/70">
        {messages.common.ist}
      </span>
    </span>
  );
}
