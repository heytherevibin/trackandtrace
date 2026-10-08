import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * One ruled section of a lead's record (ConsoleLeads.dc.html's drawer): a legend heading over its
 * body. `tight` is the heading over a list of facts, whose first row brings its own 10px.
 */
export function RecordSection({ title, tight = false, children }: { readonly title: string; readonly tight?: boolean; readonly children: ReactNode }) {
  return (
    <div className="border-line border-t px-5 pb-4 pt-3.5 max-sm:px-4">
      <h3 className={cn("legend", tight ? "mb-1" : "mb-2.5")}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * The sheet's `.kv` with its label column at the drawn 120px, which the shared list's 35% is not.
 * Both cells fill the row and share one 24px line, so the two halves of a row's hairline meet and
 * the label still sits on the value's first line when the value takes two.
 */
export function Facts({ items }: { readonly items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-4">
      {items.map(([label, value], i) => (
        <div key={label} className="contents">
          <dt className={cn("legend-sm py-2.5 leading-6", i > 0 && "border-line border-t")}>{label}</dt>
          <dd className={cn("text-body min-w-0 py-2.5 leading-6 [overflow-wrap:anywhere]", i > 0 && "border-line border-t")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
