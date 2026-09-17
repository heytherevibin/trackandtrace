import type { HTMLAttributes, ReactNode } from "react";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

// Industry .tag, as drawn: 11px body face, .02em, 3px × 10px, square.
// "accent" = .tag-accent (tint fill), "outline" = .tag-outline (steel edge and text),
// "neutral" = .tag-neutral. Tone is accepted for older call sites and maps onto these.

export type TagVariant = "accent" | "outline" | "neutral";

// .tag has no edge; only .tag-outline draws one.
const VARIANT: Record<TagVariant, string> = {
  accent: "bg-accent-soft text-accent-soft-ink",
  outline: "border border-accent text-accent",
  neutral: "bg-surface-1 text-ink-2",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: TagVariant | "soft";
  readonly tone?: Tone;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

export function Badge({ variant, tone, icon, className, children, ...rest }: BadgeProps) {
  const resolved: TagVariant = variant === "outline" ? "outline" : variant === "neutral" || tone === "neutral" ? "neutral" : "accent";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] text-2xs leading-normal tracking-head", VARIANT[resolved], className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}

export const Tag = Badge;
