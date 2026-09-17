"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

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
    <label className={cn("flex items-start gap-3", disabled && "opacity-50", className)}>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-surface-sunken shadow-key-pressed transition-colors data-[checked]:bg-accent"
      >
        <BaseSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-key-white shadow-1 transition-transform duration-(--duration-fast) ease-out data-[checked]:translate-x-5" />
      </BaseSwitch.Root>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-1">{label}</span>
        {description ? <span className="block text-xs text-ink-2">{description}</span> : null}
      </span>
    </label>
  );
}
