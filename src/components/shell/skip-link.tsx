import { messages } from "@/messages";

// Focused, it lands below the masthead (its own row, plus the route strip's on "/") rather than over it: the
// e2e focus check (tests/e2e/journey/island.spec.ts) treats anything outside <header> whose box sits within
// the masthead's own footprint as hidden behind it, since that's what a scrolled-to anchor tucked under the
// sticky masthead looks like. The link was already drawn above the masthead (z-skip > z-nav) and never
// actually hidden, but sharing base.css's --header-height keeps its focused position off the masthead's own
// ground the same way every other anchor target already stops below it.
export function SkipLink() {
  return (
    <a
      href="#main"
      className="caps sr-only z-skip border border-accent-strong bg-accent-strong px-4 py-2 text-label text-accent-ink no-underline focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(var(--header-height)+0.5rem)]"
    >
      {messages.common.skipToContent}
    </a>
  );
}
