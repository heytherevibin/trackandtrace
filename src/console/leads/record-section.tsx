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
