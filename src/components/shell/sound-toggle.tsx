"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { SWITCH_THUMB, SWITCH_TRACK } from "@/components/ui/switch";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { chooseSound, useSound } from "./use-sound";

/**
 * The landing footer's Sound switch, after Motion: off by default. On, the page's journey sounds a soft rail
 * clack as the page scrolls, starting only from the reader's own gesture. It shows only while the journey
 * runs, since only the journey can sound (journey-island.css).
 */
export function SoundToggle() {
  const on = useSound();
  return (
    <span className="sound-toggle inline-flex items-center">
      <label className="inline-flex cursor-pointer items-center gap-2.5">
        <BaseSwitch.Root checked={on} onCheckedChange={(next) => chooseSound(next)} className={cn(SWITCH_TRACK, "tap-44")}>
          <BaseSwitch.Thumb className={SWITCH_THUMB} />
        </BaseSwitch.Root>
        <span className="font-display text-xs font-semibold uppercase tracking-caps text-ink-1/70">{messages.shell.footer.sound}</span>
      </label>
    </span>
  );
}
