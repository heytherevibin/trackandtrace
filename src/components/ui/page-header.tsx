import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Page title block: optional back link and kicker, condensed capital title, lead, legend meta, actions to the right. */
export function PageHeader({
  title,
  kicker,
  lead,
  actions,
  back,
  meta,
  className,
}: {
  readonly title: string;
  readonly kicker?: ReactNode;
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  readonly back?: { readonly href: Route; readonly label: string };
  /** Legend facts under the lead (count, route, retrieval time). */
  readonly meta?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      {back ? (
        // A legend link, not a button: 20px of drawn height, so it takes the coarse-pointer hit area (motion.css).
        <Link href={back.href} className="legend tap-44 w-fit text-accent-text no-underline hover:text-accent-soft-ink">
          {`← ${back.label}`}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-[60ch]">
          {kicker ? <p className="kicker mb-3">{kicker}</p> : null}
          <h1 className="optical-hang text-page tracking-display">{title}</h1>
          {lead ? <p className="mt-3.5 text-base text-ink-2">{lead}</p> : null}
          {meta ? <div className="legend mt-3 flex flex-wrap gap-x-4 gap-y-1">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
