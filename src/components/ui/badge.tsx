import type { HTMLAttributes, ReactNode } from "react";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";

// Industry .tag, as drawn: 11px body face, .02em, 3px × 10px, square.
// "accent" = .tag-accent (tint fill), "outline" = .tag-outline (steel edge and text),
// "neutral" = .tag-neutral, "steel" = the console's .tag-outline: readable steel edge and words (B0 review).
// Tone is accepted for older call sites and maps onto these.

export type TagVariant = "accent" | "outline" | "neutral" | "steel";

// .tag has no edge; only .tag-outline draws one.
const VARIANT: Record<TagVariant, string> = {
  accent: "bg-accent-soft text-accent-soft-ink",
  outline: "border border-accent text-accent-text",
  neutral: "bg-surface-1 text-ink-2",
  steel: "border border-accent-text text-accent-text",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: TagVariant | "soft";
  readonly tone?: Tone;
  readonly icon?: ReactNode;
  readonly caps?: boolean;
  readonly children: ReactNode;
}

export function Badge({ variant, tone, icon, caps = false, className, children, ...rest }: BadgeProps) {
  const resolved: TagVariant =
    variant === "outline" || variant === "steel" ? variant : variant === "neutral" || tone === "neutral" ? "neutral" : "accent";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] text-2xs leading-normal tracking-head",
        VARIANT[resolved],
        // The console frame's own tags (environment, CONSOLE, the member's role): condensed capitals.
        caps && "font-display font-semibold uppercase tracking-caps",
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
