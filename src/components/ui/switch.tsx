"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

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
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center border border-line-strong bg-surface-1 transition-colors data-[checked]:border-accent-strong data-[checked]:bg-accent-strong"
      >
        <BaseSwitch.Thumb className="block size-3.5 translate-x-0.5 bg-ink-3 transition-transform duration-(--duration-fast) ease-out data-[checked]:translate-x-4.5 data-[checked]:bg-accent-ink" />
      </BaseSwitch.Root>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-1">{label}</span>
        {description ? <span className="block text-label text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}
