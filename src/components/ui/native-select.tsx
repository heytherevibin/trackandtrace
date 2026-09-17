import type { SelectHTMLAttributes } from "react";
import { ChevronDownRegular } from "@/components/icons";
import { cn } from "@/utils/cn";

export interface NativeSelectOption {
  readonly value: string;
  readonly label: string;
}

/** A native select dressed as a well: the platform picker on phones, keyboard-complete everywhere. */
export function NativeSelect({
  options,
  size = "md",
  className,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { readonly options: readonly NativeSelectOption[]; readonly size?: "md" | "lg" }) {
  return (
    <span className="relative flex items-center">
      <select className={cn("well w-full appearance-none pl-2.5 pr-10", size === "lg" ? "h-11" : "h-10", className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownRegular className="pointer-events-none absolute right-3 size-4 text-ink-3" aria-hidden="true" />
    </span>
  );
}
