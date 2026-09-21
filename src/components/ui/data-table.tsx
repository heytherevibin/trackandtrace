import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface Column<Row> {
  readonly key: string;
  /** Usually plain text; a ReactNode so a column can carry a visually-hidden heading (e.g. VisuallyHidden), as some sheets draw. */
  readonly header: ReactNode;
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

/** Semantic table on hairline rules. Scrolls sideways on wide screens; stacks into labelled rows below md. */
export function DataTable<Row>({ columns, rows, rowKey, caption, showCaption = false, emptyState, dense = false, className }: DataTableProps<Row>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;
  const cell = dense ? "px-3.5 py-2" : "px-5 py-3";
  // Every row, the last included, carries its hairline, as the sheets draw it.
  return (
    <div className={cn("overflow-x-auto", className)} role="region" aria-label={caption} tabIndex={0}>
      <table className="table-stack w-full border-collapse text-left text-body">
        <caption className={showCaption ? "legend px-5 py-2.5 text-left" : "sr-only"}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("legend-md border-b border-line", dense ? "px-3.5 py-2" : "px-5 py-2.5", c.align === "end" ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={cn(cell, "border-b border-line align-middle text-ink-1", c.numeric && "tnum", c.align === "end" && "text-right")}>
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
