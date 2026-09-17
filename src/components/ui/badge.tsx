import type { HTMLAttributes, ReactNode } from "react";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

// Industry tags. The palette is mono, so tone is carried by form, not hue:
// go = steel fill, watch = steel outline, stop and neutral = grey ground.
// The text always carries the meaning.

const SOFT: Record<Tone, string> = {
  go: "border-transparent bg-accent-soft text-accent-soft-ink",
  watch: "border-accent text-accent-text",
  stop: "border-transparent bg-surface-1 text-ink-2",
  neutral: "border-transparent bg-surface-1 text-ink-2",
};
const OUTLINE: Record<Tone, string> = {
  go: "border-accent text-accent-text",
  watch: "border-accent text-accent-text",
  stop: "border-line-strong text-ink-2",
  neutral: "border-line-strong text-ink-2",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: Tone;
  readonly variant?: "soft" | "outline";
  readonly size?: "sm" | "md";
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

/** A tag. Small, square, body face. Never placed above a heading. */
export function Badge({ tone = "neutral", variant = "soft", size = "md", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap border text-2xs font-medium tracking-head",
        size === "sm" ? "px-2 py-0" : "px-2.5 py-0.5",
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

export const Tag = Badge;
