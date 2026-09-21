import Link from "next/link";
import { LineHorizontal3Filled } from "@/components/icons";
import { SheetContent, SheetRoot, SheetTrigger } from "@/components/ui/sheet";
import { consoleMessages } from "@/console/messages";
import type { ConsoleModule, ConsoleNavGroup } from "@/console/nav";
import { env } from "@/services/env";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.frameSignedIn;

/**
 * "Build 42c5317 · 19 Sept 2026" once both halves of the build are known, else "Build dev"
 * (task-4-addendum.md §2 -- whose own mock reads "19 Sep"; @/utils/datetime's shared formatDate,
 * reused rather than a second hand-rolled formatter, is what Intl/CLDR's en-IN short month gives
 * for September). Neither half is ever half-fabricated: a sha with no date, or a date with no
 * sha, both fall back to "Build dev" rather than draw a build line that could be wrong.
 */
export function buildLine(sha: string | undefined, date: string | undefined): string {
  if (!sha || !date) return m.build.unknown;
  return m.build.line(sha.slice(0, 7), formatDate(date));
}

/**
 * One module's row: the numbered badge and its label, linked. Shared by ConsoleRail (desktop) and
 * ConsoleRailSheet (phone) so the two layouts, already fed the same `groups` from the one
 * `railFor()` call in ConsoleFrame, can't draw a module's number, label or href differently either
 * -- only `rowClassName` (row height and inset) varies, one column's worth of sizing, not content.
 */
function RailRow({ mod, rowClassName }: { readonly mod: ConsoleModule; readonly rowClassName: string }) {
  return (
    <Link href={mod.href} className={rowClassName}>
      <span aria-hidden="true" className="font-data tnum w-5 shrink-0 text-label text-ink-3">
        {mod.num}
      </span>
      <span className="flex-1 truncate">{mod.label}</span>
    </Link>
  );
}

const DESKTOP_ROW = "flex h-9 items-center gap-2.5 pl-6 pr-4 text-label text-ink-2 no-underline hover:bg-accent-wash hover:text-ink-1";
// 44px, not the desktop row's 36px: the phone drawer's own rowBase in both ShellPhone.dc.html and
// ConsoleMyKeysPhone.dc.html sets `height: 44px` for touch where the non-phone rowBase sets 36px --
// the same distinction box-lg draws everywhere else on a phone (ConsoleMasthead's own max-sm:size-11).
const PHONE_ROW = "flex h-11 items-center gap-2.5 pl-5 pr-4 text-label text-ink-2 no-underline hover:bg-accent-wash hover:text-ink-1";

/**
 * The module rail (Main.dc.html): each visible group's legend and its modules, then the build
 * line. ConsoleFrame renders this only once `groups` is non-empty -- in 2d-1 that is never (see
 * nav.ts's own ruling), so this component's tests are what prove the drawing until 2d-2 gives it
 * something to show.
 *
 * VERCEL_GIT_COMMIT_SHA and BUILD_DATE are read here rather than threaded down as props: Next
 * inlines `process.env.BUILD_DATE` at build time only where the literal expression appears
 * (task-4-addendum.md §2), so the read has to live in the component that draws it.
 *
 * `hidden ... sm:flex`: below sm, ConsoleFrame renders ConsoleRailSheet's trigger in this slot
 * instead (task-10-brief.md). Both are always in the tree -- CSS chooses between them, the same
 * pattern ConsoleMasthead already uses for its own wordmark text (`max-sm:hidden`) -- rather than
 * either being mounted only for one breakpoint, so neither a resize nor a hydration mismatch can
 * leave a role with no way at all to reach its modules.
 */
export function ConsoleRail({ groups }: { readonly groups: readonly ConsoleNavGroup[] }) {
  return (
    <nav aria-label={m.nav.landmark} className="hidden w-60 shrink-0 flex-col border-r border-line py-5 sm:flex">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col pb-3.5">
          <span className="legend px-6 pb-1.5">{m.nav.groupLabel[group.group]}</span>
          {/* Not `module`: reserved by webpack's module wrapper (@next/next/no-assign-module-variable). */}
          {group.modules.map((mod) => (
            <RailRow key={mod.num} mod={mod} rowClassName={DESKTOP_ROW} />
          ))}
        </div>
      ))}
      <div className="flex-1" />
      <span className="legend-sm px-6">{buildLine(env().VERCEL_GIT_COMMIT_SHA, process.env.BUILD_DATE)}</span>
    </nav>
  );
}

/**
 * The rail's phone counterpart (task-10-brief.md): a trigger the same 44px square as every other
 * phone masthead control, opening `src/components/ui/sheet.tsx`'s bottom sheet over the same
 * `groups` ConsoleRail draws as a fixed column -- never a second computation of what a role may
 * see. `sm:hidden` mirrors ConsoleRail's own `hidden ... sm:flex`: exactly one of the two is ever
 * visible at a given width, both always mounted (see ConsoleRail's own doc comment).
 *
 * Read this against ShellPhone.dc.html and ConsoleMyKeysPhone.dc.html before assuming it transcribes
 * either 1:1 -- it deliberately does not, for two reasons written up in task-10-report.md:
 *  1. Both sheets draw this control's target as a full-height drawer sliding in from the left (320px,
 *     `border-right`, no drag handle) -- the same shape src/components/shell/nav-menu.tsx already
 *     builds for the site's own collapsed nav, and NOT the bottom tray sheet.tsx implements. The
 *     brief and its addendum both name sheet.tsx specifically ("a bottom sheet"; "the phone shows
 *     the bottom-sheet trigger"), three times across the two documents and the dispatcher's own
 *     interface list -- specific and repeated enough to read as deliberate, not a slip, so it is
 *     followed here over transcribing the drawer direction 1:1. There is no accessibility conflict
 *     either way (the standing rule's own carve-out), so this is a plain component-choice deviation,
 *     not the accessibility exception -- flagged rather than silently resolved either way.
 *  2. The trigger sits in the sheets' own 56px header, left of the logo -- but ConsoleMasthead is
 *     shipped and out of this task's file list (task-4), with exactly two slots (clock, member), so
 *     no third, leading slot was added for it. It renders here instead, in the row ConsoleRail
 *     itself occupies, as a plain 44px icon column rather than a full-width bar, so no flex-direction
 *     change was needed in console-frame.tsx to fit it in.
 *
 * SheetContent's own `Drawer.Content` already carries `p-5` with no className seam to override it
 * (its one `className` prop reaches `Drawer.Popup`, not `Drawer.Content`) -- `-mx-5 -mb-5` below
 * cancels exactly that inset so the rows and the build line still reach the sheet's true edges,
 * without editing the shared primitive itself.
 */
export function ConsoleRailSheet({ groups }: { readonly groups: readonly ConsoleNavGroup[] }) {
  return (
    <SheetRoot>
      <SheetTrigger
        aria-label={m.nav.openMenu}
        className="flex size-11 shrink-0 items-center justify-center border-r border-line text-ink-2 hover:bg-accent-wash hover:text-ink-1 sm:hidden"
      >
        <LineHorizontal3Filled className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent title={m.nav.landmark}>
        <div className="-mx-5 -mb-5 flex flex-col">
          <nav aria-label={m.nav.landmark} className="flex flex-col pt-1">
            {groups.map((group) => (
              <div key={group.group} className="flex flex-col pb-2">
                <span className="legend px-5 pb-1">{m.nav.groupLabel[group.group]}</span>
                {group.modules.map((mod) => (
                  <RailRow key={mod.num} mod={mod} rowClassName={PHONE_ROW} />
                ))}
              </div>
            ))}
          </nav>
          <span className="legend-sm border-t border-line px-5 py-2">{buildLine(env().VERCEL_GIT_COMMIT_SHA, process.env.BUILD_DATE)}</span>
        </div>
      </SheetContent>
    </SheetRoot>
  );
}
