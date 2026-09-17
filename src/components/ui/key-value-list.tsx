import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface KeyValueItem {
  readonly label: string;
  readonly value: ReactNode;
  readonly numeric?: boolean;
}

/** Legend label, plain value, on hairline rows. Shares the kv-grid rule with stacked tables. */
export function KeyValueList({ items, dense = false, className }: { readonly items: readonly KeyValueItem[]; readonly dense?: boolean; readonly className?: string }) {
  return (
    <dl className={cn("kv-grid", className)}>
      {items.map((item, i) => (
        <div key={item.label} className="contents">
          <dt className={cn("legend-sm self-center", i > 0 && "border-t border-line", dense ? "py-1.5" : "py-2.5")}>{item.label}</dt>
          <dd className={cn("min-w-0 text-body text-ink-1", i > 0 && "border-t border-line", dense ? "py-1.5" : "py-2.5", item.numeric && "tnum")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
