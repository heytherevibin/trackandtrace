import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = "h2",
  id,
  className,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly as?: "h2" | "h3";
  readonly id?: string;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-prose">
        <Heading id={id} className={Heading === "h2" ? "text-2xl" : "text-xl"}>
          {title}
        </Heading>
        {description ? <p className="mt-2 text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
