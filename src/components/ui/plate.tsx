import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Corners } from "./corners";

// A plate: the Industry blueprint object. Square, hairline, transparent, with
// registration marks. An optional header row of cells reads like a drawing's
// title block: the title cell grows, meta cells ("Form TL-01", "Sheet 02")
// sit to its right behind hairlines. Plates do not nest.

export type PlatePadding = "none" | "sm" | "md" | "lg";
/** Header cell padding as the sheets draw it: tight 10×20, regular 12×20, wide 12×24. */
export type PlateCells = "tight" | "regular" | "wide";

const PAD: Record<PlatePadding, string> = { none: "", sm: "p-4", md: "p-5", lg: "p-6" };
const MIN_CH = { 12: "min-w-[12ch]", 14: "min-w-[14ch]", 16: "min-w-[16ch]" } as const;
const CELL: Record<PlateCells, string> = { tight: "px-5 py-2.5", regular: "px-5 py-3", wide: "px-6 py-3" };

/** Below sm a title that has cells beside it takes the header's whole first row, never squeezed by them. */
export const PLATE_TITLE_STACK = "max-sm:basis-full";

/** A meta or action cell: behind a hairline beside the title; below sm, sharing the row under it. */
export function plateCellClass(index: number): string {
  return cn("max-sm:flex-1 max-sm:border-t max-sm:border-line", index === 0 && "max-sm:border-l-0");
}

export interface PlateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly as?: "section" | "div" | "article" | "aside" | "figure";
  /** Title cell text. Rendered as a heading when headingLevel is set, else as a legend span. */
  readonly title?: ReactNode;
  readonly titleId?: string;
  /** 1 is for a plate that is a page's only heading (e.g. Unavailable); the sheets otherwise draw 2 or 3. */
  readonly headingLevel?: 1 | 2 | 3;
  /** Meta cells to the right of the title, each behind a hairline. */
  readonly meta?: readonly ReactNode[];
  /** A trailing cell for compact actions. */
  readonly actions?: ReactNode;
  readonly padding?: PlatePadding;
  readonly cells?: PlateCells;
  /** Minimum width of the title cell before meta cells wrap; the sheets draw 16ch, the specimen 12ch. */
  readonly titleMinCh?: 12 | 14 | 16;
  /**
   * Below sm, the title takes the header's first row and the meta and action cells share the
   * row under it, as the sheets' `.tb.stack` draws. `false` keeps everything on one row, as a
   * plain `.tb` draws — the meta/action cells still keep their `border-l` hairline. Default `true`.
   */
  readonly stack?: boolean;
  readonly corners?: boolean;
  readonly bodyClassName?: string;
  readonly children?: ReactNode;
}

export function PlateHeader({
  title,
  titleId,
  headingLevel,
  meta = [],
  actions,
  cells = "regular",
  titleMinCh = 16,
  stack = true,
}: Pick<PlateProps, "title" | "titleId" | "headingLevel" | "meta" | "actions" | "cells" | "titleMinCh" | "stack">) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "span";
  return (
    <div className="flex flex-wrap items-stretch border-b border-line">
      <Heading id={titleId} className={cn("legend flex-1 leading-6 text-ink-1", MIN_CH[titleMinCh], CELL[cells], stack && (meta.length > 0 || actions) && PLATE_TITLE_STACK)}>
        {title}
      </Heading>
      {meta.map((cell, i) => (
        <span key={i} className={cn("legend whitespace-nowrap border-l border-line leading-6", CELL[cells], stack && plateCellClass(i))}>
          {cell}
        </span>
      ))}
      {actions ? <span className={cn("flex items-center gap-2 border-l border-line px-3 py-1.5", stack && plateCellClass(meta.length))}>{actions}</span> : null}
    </div>
  );
}

export function Plate({
  as: Tag = "section",
  title,
  titleId,
  headingLevel,
  meta,
  actions,
  padding = "md",
  cells,
  titleMinCh,
  stack,
  corners = true,
  className,
  bodyClassName,
  children,
  ...rest
}: PlateProps) {
  const hasHeader = title !== undefined || (meta && meta.length > 0);
  return (
    <Tag className={cn("blueprint", className)} aria-labelledby={hasHeader && titleId && headingLevel ? titleId : undefined} {...rest}>
      {corners ? <Corners /> : null}
      {hasHeader ? <PlateHeader title={title} titleId={titleId} headingLevel={headingLevel} meta={meta} actions={actions} cells={cells} titleMinCh={titleMinCh} stack={stack} /> : null}
      {children !== undefined ? <div className={cn(PAD[padding], bodyClassName)}>{children}</div> : null}
    </Tag>
  );
}
