import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

// A raised plate on the instrument face. The legend is the plate's own heading,
// set in silkscreen, never a kicker above another heading. Panels do not nest.

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly as?: "section" | "div" | "article" | "aside";
  readonly legend?: string;
  readonly legendId?: string;
  readonly headingLevel?: 2 | 3;
  readonly actions?: ReactNode;
  readonly padding?: "none" | "sm" | "md" | "lg";
  readonly children: ReactNode;
}

const PAD = { none: "", sm: "p-3", md: "p-4 sm:p-6", lg: "p-6 sm:p-8" } as const;

export function Panel({ as: Tag = "section", legend, legendId, headingLevel = 2, actions, padding = "md", className, children, ...rest }: PanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Tag className={cn("panel", className)} aria-labelledby={legend && legendId ? legendId : undefined} {...rest}>
      {legend ? (
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
          <Heading id={legendId} className="font-label text-sm font-semibold uppercase tracking-wide text-ink-1">
            {legend}
          </Heading>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={PAD[padding]}>{children}</div>
    </Tag>
  );
}
