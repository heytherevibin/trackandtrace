"use client";

import { useEffect, useState } from "react";
import { messages } from "@/messages";
import { countdownTo, formatTime } from "@/utils/datetime";

/** "15:20 IST · in 3 h 20 min", in the figure face of its cell. The countdown renders after mount so server and client HTML match. */
export function ChartCountdown({ chartAt }: { readonly chartAt: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const m = messages.result.chart;
  const countdown = now ? countdownTo(chartAt, now) : null;
  return (
    <span>
      {m.at(formatTime(chartAt))}
      {countdown ? <span className="text-ink-1/70">{` · ${countdown.state === "ahead" ? m.in(countdown.hours, countdown.minutes) : m.prepared}`}</span> : null}
    </span>
  );
}
