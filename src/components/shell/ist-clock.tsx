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
 * The platform clock: live IST in condensed figures; the minute turns over like a split-flap.
 * Renders a placeholder until mounted so server HTML matches.
 */
export function IstClock({ size = "sm", framed = false, className }: { readonly size?: "sm" | "md"; readonly framed?: boolean; readonly className?: string }) {
  const [tick, setTick] = useState<Tick>({ time: null, turned: false });
  useEffect(() => {
    const read = () => setTick((prev) => {
      const next = formatTime(new Date());
      return next === prev.time ? prev : { time: next, turned: prev.time !== null };
    });
    read();
    const timer = window.setInterval(read, 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const time = tick.time ?? "--:--";
  return (
    <span className={cn("inline-flex items-baseline gap-2", framed && "items-center border border-line px-3 py-1.5", className)} aria-label={`${time} ${messages.common.ist}`} role="img">
      <span key={time} aria-hidden="true" className={cn("font-data tracking-brand text-ink-1", size === "md" ? "text-xl" : "text-body", tick.turned && "flip")}>
        {time}
      </span>
      <span aria-hidden="true" className="legend-sm">
        {messages.common.ist}
      </span>
    </span>
  );
}
