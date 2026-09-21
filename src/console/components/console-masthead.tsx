import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.frame;

export interface ConsoleMastheadProps {
  /**
   * The phone rail drawer's trigger (ShellPhone.dc.html:34, before the mark), task-10-fix-1.md's
   * own third slot. Omitted whenever ConsoleRailDrawer would draw nothing -- same `groups.length >
   * 0` gate the desktop rail is behind (console-frame.tsx), never a trigger with nowhere to open.
   */
  readonly leading?: ReactNode;
  /** The clock (Main.dc.html:41), before the theme button. Omitted signed-out, same as the sheet's `showMember`. */
  readonly clock?: ReactNode;
  /** The member menu trigger, after the theme button. Omitted signed-out, same as the sheet's `showMember`. */
  readonly member?: ReactNode;
}

/**
 * The console masthead, 56px, as drawn for Sign In and Setup: the mark, TRAKLINE, the CONSOLE tag
 * and the theme button -- unchanged, whether or not `clock`/`member` are given. Signed-in parts
 * (Main.dc.html:38-58) sit in the same trailing flex group as the theme button, in the sheet's own
 * order (clock, theme, member), rather than wrapped around this component from the outside: both
 * slots are optional so SignedOutFrame and the setup/sign-in pages render exactly as before.
 *
 * `leading` is a third, later addition (task-10-fix-1.md): ShellPhone.dc.html's own hamburger sits
 * before the mark, not in the trailing group, so it gets its own slot rather than being folded into
 * one of the other two. Optional like them, for the same reason -- SignedOutFrame and the
 * setup/sign-in pages never pass it, so they render exactly as before.
 */
export function ConsoleMasthead({ leading, clock, member }: ConsoleMastheadProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 sm:gap-3 sm:px-6">
      {leading}
      <Link href={consoleHref("/")} aria-label={m.home} className="inline-flex items-center gap-2.5 text-ink-1 no-underline max-sm:size-11 max-sm:justify-center">
        <Mark size={24} />
        <span className="font-display text-lg font-semibold uppercase tracking-brand max-sm:hidden">{m.productName}</span>
      </Link>
      <Badge variant="steel" caps>
        {m.consoleTag}
      </Badge>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {clock}
        <ThemeToggle className="max-sm:size-11" />
        {member}
      </div>
    </header>
  );
}
