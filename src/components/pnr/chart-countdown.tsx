"use client";

import { useEffect, useState } from "react";
import { messages } from "@/messages";
import { countdownTo, formatTime } from "@/utils/datetime";

/** "Chart at 13:00 IST (in 3 h 20 min)". The countdown renders after mount so server and client HTML match. */
export function ChartCountdown({ chartAt }: { readonly chartAt: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const m = messages.result.band;
  const countdown = now ? countdownTo(chartAt, now) : null;
  return (
    <span className="font-data text-sm text-ink-1">
      {m.chartAt(formatTime(chartAt))}
      {countdown ? <span className="text-ink-2"> {countdown.state === "ahead" ? m.chartIn(countdown.hours, countdown.minutes) : m.chartPrepared}</span> : null}
    </span>
  );
}
