import type { ReactNode } from "react";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";
import { Corners } from "./corners";

/** Shared anatomy for empty, unavailable, and error states: a plate with a capital title, detail, evidence, actions. */
export function StateBlock({
  tone = "neutral",
  title,
  detail,
  actions,
  children,
  role,
  live,
  headingLevel = 2,
  className,
}: {
  /** Kept for call-site compatibility; the mono world marks state with words, not colour. */
  readonly tone?: Tone;
  readonly title: string;
  readonly detail?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly role?: "status" | "alert";
  readonly live?: "polite" | "assertive";
  readonly headingLevel?: 1 | 2 | 3;
  readonly className?: string;
}) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={cn("blueprint p-6", className)} role={role} aria-live={live} data-tone={tone}>
      <Corners />
      <Heading className="text-3xl tracking-head">{title}</Heading>
      {detail ? <p className="mt-2.5 max-w-[64ch] text-body text-ink-2">{detail}</p> : null}
      {children ? <div className="seam mt-[18px] pt-3.5">{children}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}
