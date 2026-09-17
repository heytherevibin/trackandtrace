"use client";

import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

const SIZE = { sm: "h-9 px-2.5", md: "h-10 px-3", lg: "h-11 px-3" } as const;

export interface InputProps extends Omit<ComponentProps<typeof BaseField.Control>, "size"> {
  readonly size?: keyof typeof SIZE;
  readonly leadingIcon?: ReactNode;
  readonly trailingSlot?: ReactNode;
}

/** A well: tinted ground, hairline, steel on focus. Must sit inside <Field>. Always 16px so Safari does not zoom. */
export function Input({ size = "md", leadingIcon, trailingSlot, className, ...rest }: InputProps) {
  return (
    <div className="relative flex items-center">
      {leadingIcon ? <span className="pointer-events-none absolute left-3 text-ink-3">{leadingIcon}</span> : null}
      <BaseField.Control
        className={cn(
          "well w-full text-base placeholder:text-ink-3",
          "data-[invalid]:border-ink-alert aria-[invalid=true]:border-ink-alert disabled:cursor-not-allowed disabled:opacity-45",
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
