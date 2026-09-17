import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface KeyValueItem {
  readonly label: string;
  readonly value: ReactNode;
  readonly numeric?: boolean;
}

/** Silkscreen label, plain value. Shares the kv-grid rule with stacked tables. */
export function KeyValueList({ items, dense = false, className }: { readonly items: readonly KeyValueItem[]; readonly dense?: boolean; readonly className?: string }) {
  return (
    <dl className={cn("kv-grid", dense ? "gap-y-1.5" : "gap-y-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="silk">{item.label}</dt>
          <dd className={cn("min-w-0 text-ink-1", item.numeric && "font-data")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
