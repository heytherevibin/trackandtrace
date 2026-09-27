"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** The square track, steel when on, and its thumb. The footer's switches share them and label as legends. */
export const SWITCH_TRACK =
  "relative inline-flex h-5 w-9 shrink-0 items-center border border-line-strong bg-surface-1 transition-colors data-[checked]:border-accent-strong data-[checked]:bg-accent-strong";
export const SWITCH_THUMB =
  "block size-3.5 translate-x-0.5 bg-ink-3 transition-transform duration-(--duration-fast) ease-out data-[checked]:translate-x-4.5 data-[checked]:bg-accent-ink";

/** A square toggle: hairline track, steel when on. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-3", disabled && "opacity-45", className)}>
      <BaseSwitch.Root checked={checked} onCheckedChange={(next) => onCheckedChange(next)} disabled={disabled} className={cn("mt-0.5", SWITCH_TRACK)}>
        <BaseSwitch.Thumb className={SWITCH_THUMB} />
      </BaseSwitch.Root>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-1">{label}</span>
        {description ? <span className="block text-label text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}
