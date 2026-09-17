"use client";

import { useEffect, useState } from "react";
import { SegmentReadout } from "@/components/ui/segment-readout";
import { messages } from "@/messages";
import { formatTime } from "@/utils/datetime";

/** The platform clock: live IST on a segment readout. Renders blank until mounted so server HTML matches. */
export function IstClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const time = now ? formatTime(now) : "--:--";
  return (
    <span className="flex items-center gap-2">
      <SegmentReadout value={time} label={`${time} ${messages.common.ist}`} size="sm" />
      <span className="silk text-ink-3">{messages.common.ist}</span>
    </span>
  );
}
