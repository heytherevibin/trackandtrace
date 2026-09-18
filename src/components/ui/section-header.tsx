import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// The section head: "02 · How it works" in steel, a hairline rule, then the
// condensed capital heading. Without a kicker it is the heading alone.

export function SectionHeader({
  kicker,
  title,
  description,
  actions,
  as: Heading = "h2",
  id,
  className,
}: {
  readonly kicker?: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly as?: "h2" | "h3";
  readonly id?: string;
  readonly className?: string;
}) {
  return (
    <div className={className}>
      {kicker ? (
        <>
          <span className="kicker mb-3 block">{kicker}</span>
          <hr className="mb-3 h-px border-0 bg-line" />
        </>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-measure">
          <Heading id={id} className={cn("optical-hang tracking-head", Heading === "h2" ? "text-5xl" : "text-2xl")}>
            {title}
          </Heading>
          {description ? <p className="mt-4 text-body text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
