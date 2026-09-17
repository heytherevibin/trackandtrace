import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ArrowLeftRegular } from "@/components/icons";
import { cn } from "@/utils/cn";

/** Page title in the display face. No kicker: the heading carries its own weight. */
export function PageHeader({
  title,
  lead,
  actions,
  back,
  meta,
  className,
}: {
  readonly title: string;
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  readonly back?: { readonly href: Route; readonly label: string };
  /** Silkscreen facts under the title (route, date, retrieval time). */
  readonly meta?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      {back ? (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 font-label text-sm font-semibold uppercase tracking-wide text-ink-2 hover:text-ink-1">
          <ArrowLeftRegular className="size-4" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-prose">
          <h1 className="text-3xl sm:text-4xl">{title}</h1>
          {lead ? <p className="mt-3 text-lg text-ink-2">{lead}</p> : null}
          {meta ? <div className="silk mt-3 flex flex-wrap gap-x-4 gap-y-1">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
