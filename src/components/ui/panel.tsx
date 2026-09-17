import type { HTMLAttributes, ReactNode } from "react";
import { Plate, type PlatePadding } from "./plate";

// Compatibility face of Plate for surfaces written before the Industry world.
// New code uses Plate directly.

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly as?: "section" | "div" | "article" | "aside";
  readonly legend?: string;
  readonly legendId?: string;
  readonly headingLevel?: 2 | 3;
  readonly actions?: ReactNode;
  readonly padding?: PlatePadding;
  readonly children: ReactNode;
}

export function Panel({ legend, legendId, headingLevel = 2, ...rest }: PanelProps) {
  return <Plate title={legend} titleId={legendId} headingLevel={legend ? headingLevel : undefined} {...rest} />;
}
