"use client";

import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

const SIZE = { sm: "h-9 px-3 text-sm", md: "h-11 px-3 text-base", lg: "h-12 px-4 text-base" } as const;

export interface InputProps extends Omit<ComponentProps<typeof BaseField.Control>, "size"> {
  readonly size?: keyof typeof SIZE;
  readonly leadingIcon?: ReactNode;
  readonly trailingSlot?: ReactNode;
}

/** A text well on the panel. Must sit inside <Field>. Always 16px on mobile so Safari does not zoom. */
export function Input({ size = "md", leadingIcon, trailingSlot, className, ...rest }: InputProps) {
  return (
    <div className="relative flex items-center">
      {leadingIcon ? <span className="pointer-events-none absolute left-3 text-ink-3">{leadingIcon}</span> : null}
      <BaseField.Control
        className={cn(
          "w-full rounded-md border border-line-strong bg-surface-sunken text-ink-1 placeholder:text-ink-3",
          "shadow-key-pressed transition-colors hover:border-ink-3 focus:border-focus focus:outline-none",
          "data-[invalid]:border-stop aria-[invalid=true]:border-stop disabled:cursor-not-allowed disabled:opacity-50",
          SIZE[size],
          leadingIcon && "pl-8",
          trailingSlot && "pr-12",
          className,
        )}
        {...rest}
      />
      {trailingSlot ? <span className="absolute right-2 flex items-center">{trailingSlot}</span> : null}
    </div>
  );
}
