import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { VisuallyHidden } from "./visually-hidden";

export interface Column<Row> {
  readonly key: string;
  /**
   * Plain text, deliberately. It is also the row label the stacked phone layout prints through
   * `content: attr(data-label)` (src/styles/utilities.css), and a DOM attribute can only hold a
   * string -- a ReactNode here stringifies to "[object Object]" with no React warning, and shows
   * up as "[OBJECT OBJECT]" under 768px. To hide a header visually, use `hideHeader`.
   */
  readonly header: string;
  /** Renders the header for screen readers only, as ConsoleMyKeys.dc.html:111 draws its Actions column. */
  readonly hideHeader?: boolean;
  /**
   * Drops the column below `sm` -- header, cells and the stacked layout's own row label alike, so
   * nothing prints a heading over an empty value. For a column a phone sheet deliberately does not
   * draw (ConsoleTeamPhone.dc.html carries no row actions at all), not for one that is merely
   * cramped. The rule lives in `table-stack` (src/styles/utilities.css), because the stacked
   * layout's `display: contents` on a cell out-specifies any utility class put on it here.
   */
  readonly phoneHidden?: boolean;
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
              <th
                key={c.key}
                scope="col"
                data-phone-hidden={c.phoneHidden ? "" : undefined}
                className={cn("legend-md border-b border-line", dense ? "px-3.5 py-2" : "px-5 py-2.5", c.align === "end" ? "text-right" : "text-left")}
              >
                {c.hideHeader ? <VisuallyHidden>{c.header}</VisuallyHidden> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header}
                  data-phone-hidden={c.phoneHidden ? "" : undefined}
                  className={cn(cell, "border-b border-line align-middle text-ink-1", c.numeric && "tnum", c.align === "end" && "text-right")}
                >
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
