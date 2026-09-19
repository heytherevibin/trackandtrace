import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.frame;

/**
 * The console masthead, 56px, as drawn for Sign In and Setup: the mark, TRAKLINE, the CONSOLE tag and the theme
 * button. Signed-in parts (the clock and the member box) arrive with sessions.
 */
export function ConsoleMasthead() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 sm:gap-3 sm:px-6">
      <Link href={consoleHref("/")} aria-label={m.home} className="inline-flex items-center gap-2.5 text-ink-1 no-underline max-sm:size-11 max-sm:justify-center">
        <Mark size={24} />
        <span className="font-display text-lg font-semibold uppercase tracking-brand max-sm:hidden">{m.productName}</span>
      </Link>
      <Badge variant="steel" caps>
        {m.consoleTag}
      </Badge>
      <div className="flex-1" />
      <ThemeToggle className="max-sm:size-11" />
    </header>
  );
}
