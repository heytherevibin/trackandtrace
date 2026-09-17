"use client";

import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

// Base UI Field wires label, description, error, aria-describedby, and
// aria-invalid. We only dress it.

export function Field({ className, ...rest }: ComponentProps<typeof BaseField.Root>) {
  return <BaseField.Root className={cn("flex flex-col gap-1.5", className)} {...rest} />;
}

export function FieldLabel({ className, ...rest }: ComponentProps<typeof BaseField.Label>) {
  return <BaseField.Label className={cn("silk", className)} {...rest} />;
}

export function FieldHint({ className, ...rest }: ComponentProps<typeof BaseField.Description>) {
  return <BaseField.Description className={cn("text-xs text-ink-2", className)} {...rest} />;
}

export function FieldError({ className, children, ...rest }: ComponentProps<typeof BaseField.Error> & { readonly children?: ReactNode }) {
  return (
    <BaseField.Error className={cn("text-xs font-medium text-stop", className)} {...rest}>
      {children}
    </BaseField.Error>
  );
}

export const FieldControl = BaseField.Control;
