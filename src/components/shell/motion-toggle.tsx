"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { useId } from "react";
import { chooseMotion, useMotion } from "@/components/motion/use-motion";
import { SWITCH_THUMB, SWITCH_TRACK } from "@/components/ui/switch";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

/**
 * The landing footer's Motion switch, after the clock. On by default; off stills every traveller page as the
 * device's reduced-motion setting does (motion.css, SiteMotion). When the device asks for reduced motion it
 * reads off, is disabled, and says why beside it. Only the track dims; the words keep their contrast.
 */
export function MotionToggle() {
  const { motion, deviceReduced } = useMotion();
  const noteId = useId();
  const m = messages.shell.footer;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <label className={cn("inline-flex items-center gap-2.5", !deviceReduced && "cursor-pointer")}>
        <BaseSwitch.Root
          checked={motion === "on"}
          onCheckedChange={(next) => chooseMotion(next)}
          disabled={deviceReduced}
          aria-describedby={deviceReduced ? noteId : undefined}
          className={cn(SWITCH_TRACK, "tap-44 data-[disabled]:opacity-45")}
        >
          <BaseSwitch.Thumb className={SWITCH_THUMB} />
        </BaseSwitch.Root>
        <span className="font-display text-xs font-semibold uppercase tracking-caps text-ink-1/70">{m.motion}</span>
      </label>
      {deviceReduced ? (
        <span id={noteId} className="text-label text-ink-3">
          {m.motionByDevice}
        </span>
      ) : null}
    </span>
  );
}
