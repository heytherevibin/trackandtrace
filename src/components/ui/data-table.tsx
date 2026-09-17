import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: "start" | "end";
  readonly numeric?: boolean;
}

export interface DataTableProps<Row> {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Required accessible name; visually hidden unless showCaption. */
  readonly caption: string;
  readonly showCaption?: boolean;
  readonly emptyState?: ReactNode;
  readonly dense?: boolean;
  readonly className?: string;
}

/** Semantic table. Scrolls sideways on wide screens; stacks into labelled rows below md. */
export function DataTable<Row>({ columns, rows, rowKey, caption, showCaption = false, emptyState, dense = false, className }: DataTableProps<Row>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;
  const cell = dense ? "px-3 py-2" : "px-4 py-3";
  return (
    <div className={cn("overflow-x-auto", className)} role="region" aria-label={caption} tabIndex={0}>
      <table className="table-stack w-full text-left text-sm">
        <caption className={showCaption ? "silk py-2 text-left" : "sr-only"}>{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("silk", cell, c.align === "end" && "text-right")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={cn(cell, "align-top text-ink-1", c.numeric && "font-data", c.align === "end" && "text-right")}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
