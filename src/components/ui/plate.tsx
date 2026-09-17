import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Corners } from "./corners";

// A plate: the Industry blueprint object. Square, hairline, transparent, with
// registration marks. An optional header row of cells reads like a drawing's
// title block: the title cell grows, meta cells ("Form T&T-01", "Sheet 02")
// sit to its right behind hairlines. Plates do not nest.

export type PlatePadding = "none" | "sm" | "md" | "lg";
/** Header cell padding as the sheets draw it: tight 10×20, regular 12×20, wide 12×24. */
export type PlateCells = "tight" | "regular" | "wide";

const PAD: Record<PlatePadding, string> = { none: "", sm: "p-4", md: "p-5", lg: "p-6" };
const CELL: Record<PlateCells, string> = { tight: "px-5 py-2.5", regular: "px-5 py-3", wide: "px-6 py-3" };

export interface PlateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly as?: "section" | "div" | "article" | "aside" | "figure";
  /** Title cell text. Rendered as a heading when headingLevel is set, else as a legend span. */
  readonly title?: ReactNode;
  readonly titleId?: string;
  readonly headingLevel?: 2 | 3;
  /** Meta cells to the right of the title, each behind a hairline. */
  readonly meta?: readonly ReactNode[];
  /** A trailing cell for compact actions. */
  readonly actions?: ReactNode;
  readonly padding?: PlatePadding;
  readonly cells?: PlateCells;
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
}: Pick<PlateProps, "title" | "titleId" | "headingLevel" | "meta" | "actions" | "cells">) {
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "span";
  return (
    <div className="flex flex-wrap items-stretch border-b border-line">
      <Heading id={titleId} className={cn("legend min-w-[16ch] flex-1 leading-6 text-ink-1", CELL[cells])}>
        {title}
      </Heading>
      {meta.map((cell, i) => (
        <span key={i} className={cn("legend whitespace-nowrap border-l border-line leading-6", CELL[cells])}>
          {cell}
        </span>
      ))}
      {actions ? <span className="flex items-center gap-2 border-l border-line px-3 py-1.5">{actions}</span> : null}
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
      {hasHeader ? <PlateHeader title={title} titleId={titleId} headingLevel={headingLevel} meta={meta} actions={actions} cells={cells} /> : null}
      {children !== undefined ? <div className={cn(PAD[padding], bodyClassName)}>{children}</div> : null}
    </Tag>
  );
}
