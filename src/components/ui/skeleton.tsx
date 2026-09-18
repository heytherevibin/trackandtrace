import type { ReactNode } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

/** A loading shape: a flat block. Decorative; the enclosing SkeletonGroup announces the wait. */
export function Skeleton({
  variant = "rect",
  className,
}: {
  readonly variant?: "text" | "rect" | "circle";
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("skeleton block", variant === "text" && "h-4 w-full", variant === "rect" && "h-8 w-full", variant === "circle" && "size-10 rounded-full", className)}
    />
  );
}

export function SkeletonGroup({ label = messages.common.loading, className, children }: { readonly label?: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
