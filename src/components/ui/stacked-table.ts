// Tables that fold into labelled records on narrow screens, so no table is ever wider than its
// plate. Below the breakpoint every row becomes a small grid; each cell draws its column name
// above its value from `data-label`. The drawn name is CSS generated text with empty alt text,
// so assistive tech hears the column header once, not twice. Changing a table's display drops
// its table semantics in browsers, so markup built with these classes carries STACKED_ROLES.
//
// Class strings are spelled out in full for both breakpoints: Tailwind only generates classes
// it can read literally in the source.

export type StackBelow = "sm" | "lg";

export interface StackedTableClasses {
  readonly table: string;
  readonly head: string;
  readonly body: string;
  /** Add the row's grid template (for example max-sm:grid-cols-3) beside this. */
  readonly row: string;
  readonly cell: string;
  /** A cell that spans the whole record row, with no drawn label (the row's name, its actions). */
  readonly wide: string;
}

const CLASSES: Readonly<Record<StackBelow, StackedTableClasses>> = {
  sm: {
    table: "max-sm:block",
    head: "max-sm:sr-only",
    body: "max-sm:block",
    row: "max-sm:grid max-sm:items-start max-sm:gap-x-4 max-sm:gap-y-3 max-sm:border-b max-sm:border-line max-sm:px-5 max-sm:py-4 max-sm:last:border-b-0",
    cell: "max-sm:min-w-0 max-sm:border-0 max-sm:p-0 max-sm:before:legend-sm max-sm:before:mb-1 max-sm:before:block max-sm:before:text-ink-1/70 max-sm:before:content-[attr(data-label)_/_'']",
    wide: "max-sm:col-span-full",
  },
  lg: {
    table: "max-lg:block",
    head: "max-lg:sr-only",
    body: "max-lg:block",
    row: "max-lg:grid max-lg:items-start max-lg:gap-x-4 max-lg:gap-y-3 max-lg:border-b max-lg:border-line max-lg:px-5 max-lg:py-4 max-lg:last:border-b-0",
    cell: "max-lg:min-w-0 max-lg:border-0 max-lg:p-0 max-lg:before:legend-sm max-lg:before:mb-1 max-lg:before:block max-lg:before:text-ink-1/70 max-lg:before:content-[attr(data-label)_/_'']",
    wide: "max-lg:col-span-full",
  },
};

export function stackedTable(below: StackBelow): StackedTableClasses {
  return CLASSES[below];
}

/** Explicit roles that keep a restyled table announced as a table. */
export const STACKED_ROLES = {
  table: "table",
  rowgroup: "rowgroup",
  row: "row",
  columnheader: "columnheader",
  cell: "cell",
} as const;
