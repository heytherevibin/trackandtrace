"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { CheckmarkRegular, ChevronDownRegular } from "@/components/icons";
import { cn } from "@/utils/cn";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly value: string | null;
  readonly onValueChange: (value: string | null) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly name?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

/** A custom listbox for choices that need rich rows. Plain choices use NativeSelect. */
export function Select({ value, onValueChange, options, placeholder, name, disabled, id, className }: SelectProps) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <BaseSelect.Root value={value} onValueChange={(next) => onValueChange(next)} items={items} name={name} disabled={disabled}>
      <BaseSelect.Trigger
        id={id}
        className={cn("well flex h-10 w-full items-center justify-between gap-2 px-3 text-base data-[popup-open]:border-accent disabled:cursor-not-allowed disabled:opacity-45", className)}
      >
        <BaseSelect.Value placeholder={placeholder} className="truncate data-[placeholder]:text-ink-3" />
        <BaseSelect.Icon className="shrink-0 text-ink-3">
          <ChevronDownRegular className="size-4" aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-popover outline-none">
          <BaseSelect.Popup className="popup-motion max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto border border-line bg-surface-2 p-1 shadow-2">
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className="flex cursor-default items-center justify-between gap-3 px-3 py-2 text-sm text-ink-1 outline-none data-[highlighted]:bg-accent-wash data-[disabled]:opacity-45"
                >
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="text-accent-text">
                    <CheckmarkRegular className="size-4" aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
