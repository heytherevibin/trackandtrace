import type { ReactNode } from "react";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";
import { Led } from "./led";

/** Shared anatomy for empty, unavailable, and error states: lamp, title, detail, actions. */
export function StateBlock({
  tone = "neutral",
  title,
  detail,
  actions,
  children,
  role,
  live,
  className,
}: {
  readonly tone?: Tone;
  readonly title: string;
  readonly detail?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly role?: "status" | "alert";
  readonly live?: "polite" | "assertive";
  readonly className?: string;
}) {
  return (
    <section className={cn("panel p-6 sm:p-8", className)} role={role} aria-live={live}>
      <div className="flex items-start gap-3">
        <Led tone={tone} lit size="lg" className="mt-1.5" />
        <div className="min-w-0">
          <h2 className="text-xl">{title}</h2>
          {detail ? <p className="mt-2 text-ink-2">{detail}</p> : null}
        </div>
      </div>
      {children ? <div className="seam mt-6 pt-6">{children}</div> : null}
      {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}
