import type { HTMLAttributes, ReactNode } from "react";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

const SOFT: Record<Tone, string> = {
  go: "bg-go-bg text-go border-go-line",
  watch: "bg-watch-bg text-watch border-watch-line",
  stop: "bg-stop-bg text-stop border-stop-line",
  neutral: "bg-neutral-bg text-neutral border-neutral-line",
};
const OUTLINE: Record<Tone, string> = {
  go: "text-go border-go-line",
  watch: "text-watch border-watch-line",
  stop: "text-stop border-stop-line",
  neutral: "text-ink-2 border-line-strong",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: Tone;
  readonly variant?: "soft" | "outline";
  readonly size?: "sm" | "md";
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

/** A silkscreen tag. Never placed above a heading. */
export function Badge({ tone = "neutral", variant = "soft", size = "md", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border font-label font-semibold uppercase tracking-wide",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-xs",
        variant === "soft" ? SOFT[tone] : OUTLINE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
