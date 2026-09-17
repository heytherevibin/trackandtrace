import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface NativeSelectOption {
  readonly value: string;
  readonly label: string;
}

/** The sheet's select: a native control dressed as a well, with the platform's own arrow. */
export function NativeSelect({
  options,
  size = "md",
  className,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { readonly options: readonly NativeSelectOption[]; readonly size?: "md" | "lg" }) {
  return (
    <select className={cn("well w-full px-2.5", size === "lg" ? "h-11" : "h-10", className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
