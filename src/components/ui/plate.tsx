import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Corners } from "./corners";

// A plate: the Industry blueprint object. Square, hairline, transparent, with
// registration marks. An optional header row of cells reads like a drawing's
// title block: the title cell grows, meta cells ("Form T&T-01", "Sheet 02")
// sit to its right behind hairlines. Plates do not nest.

export type PlatePadding = "none" | "sm" | "md" | "lg";

const PAD: Record<PlatePadding, string> = { none: "", sm: "p-4", md: "p-5", lg: "p-6 sm:p-8" };

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
}: Pick<PlateProps, "title" | "titleId" | "headingLevel" | "meta" | "actions">) {
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "span";
  return (
    <div className="flex flex-wrap items-stretch border-b border-line">
      <Heading id={titleId} className="legend min-w-40 flex-1 px-5 py-2.5 leading-6 text-ink-1">
        {title}
      </Heading>
      {meta.map((cell, i) => (
        <span key={i} className="legend whitespace-nowrap border-l border-line px-5 py-2.5 leading-6">
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
      {hasHeader ? <PlateHeader title={title} titleId={titleId} headingLevel={headingLevel} meta={meta} actions={actions} /> : null}
      {children !== undefined ? <div className={cn(PAD[padding], bodyClassName)}>{children}</div> : null}
    </Tag>
  );
}
