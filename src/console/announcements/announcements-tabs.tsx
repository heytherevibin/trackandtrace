import Link from "next/link";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.announcements.tabs;

const TABS = [
  { key: "letters", href: consoleHref("/announcements"), label: m.letters },
  { key: "suppressions", href: consoleHref("/announcements/suppressions"), label: m.suppressions },
] as const;

/**
 * The tab row above the two lists (ConsoleAnnouncements.dc.html:83-88), in the look of
 * src/components/ui/tabs.tsx.
 *
 * The sheet draws `role="tablist"`. These are links in a `<nav>` instead, with `aria-current`: each
 * tab is its own address with its own server read, and a tablist promises panels swapped in place
 * and arrow-key movement between them, which a page navigation is not. The drawing is kept exactly;
 * only the role says what it really is.
 *
 * Full width with 44px cells below `sm`, as the phone board draws its `tabs-lg`.
 */
export function AnnouncementsTabs({ current }: { readonly current: "letters" | "suppressions" }) {
  return (
    <nav aria-label={m.label} className="border-line mt-6 inline-flex self-start border max-sm:flex">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "press font-display text-2xs tracking-caps not-first:border-line inline-flex h-8 items-center justify-center px-3 font-semibold uppercase no-underline outline-none not-first:border-l max-sm:h-11 max-sm:flex-1",
            tab.key === current ? "bg-accent/16 text-accent-text" : "text-ink-3 hover:bg-accent/12",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
