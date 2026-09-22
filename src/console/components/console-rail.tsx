import { Drawer } from "@base-ui/react/drawer";
import Link from "next/link";
import { DismissRegular, LineHorizontal3Filled } from "@/components/icons";
import { Mark } from "@/components/brand/mark";
import { Badge } from "@/components/ui/badge";
import { consoleMessages } from "@/console/messages";
import type { ConsoleModule, ConsoleNavGroup } from "@/console/nav";
import { env } from "@/services/env";
import { formatDate } from "@/utils/datetime";

const m = consoleMessages.frameSignedIn;
const f = consoleMessages.frame;

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
 * ConsoleRailDrawer (phone) so the two layouts, already fed the same `groups` from the one
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
 * line. ConsoleFrame renders this only once `groups` is non-empty -- in 2d-1 that was never (see
 * nav.ts's own ruling), so this component's own tests were what proved the drawing. 2d-2 task-8
 * gives it something real to show: an Owner's Configure group, with 13 Team in it.
 *
 * VERCEL_GIT_COMMIT_SHA and BUILD_DATE are read here rather than threaded down as props: Next
 * inlines `process.env.BUILD_DATE` at build time only where the literal expression appears
 * (task-4-addendum.md §2), so the read has to live in the component that draws it.
 *
 * `hidden ... sm:flex`: below sm, ConsoleMasthead's `leading` slot carries ConsoleRailDrawer's
 * trigger instead (task-10-brief.md, task-10-fix-1.md). Both are always in the tree -- CSS chooses
 * between them, the same pattern ConsoleMasthead already uses for its own wordmark text
 * (`max-sm:hidden`) -- rather than either being mounted only for one breakpoint, so neither a
 * resize nor a hydration mismatch can leave a role with no way at all to reach its modules.
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
 * The rail's phone counterpart (task-10-brief.md, corrected by task-10-fix-1.md): a trigger for
 * `ConsoleMasthead`'s `leading` slot, opening a left-anchored full-height drawer over the same
 * `groups` ConsoleRail draws as a fixed column -- never a second computation of what a role may
 * see. `sm:hidden` mirrors ConsoleRail's own `hidden ... sm:flex`: exactly one of the two is ever
 * visible at a given width, both always mounted (see ConsoleRail's own doc comment).
 *
 * task-10-report.md first built this over `src/components/ui/sheet.tsx`'s bottom tray, on the
 * brief and addendum's own specific, repeated instruction ("a bottom sheet"). Both were wrong, on
 * direct re-reading of ShellPhone.dc.html by the one who wrote them (task-10-fix-1.md): the drawn
 * target is `position: absolute; left: 0; top: 0; bottom: 0; width: 320px; ... border-right: 1px solid
 * var(--line);` over an `inset: 0` backdrop -- a drawer, and the sheet's own prop is literally named
 * `drawer` / `drawerOpen`. This is that drawer instead, built directly on `@base-ui/react/drawer`
 * (not `sheet.tsx`, which hard-codes a bottom-anchored tray with no seam to reanchor it) by
 * following `src/components/shell/nav-menu.tsx` -- the site's own left-anchored collapsed nav,
 * already proven in production -- rather than inventing open/close, backdrop, focus-trap or escape
 * handling of its own: `swipeDirection="left"`, the backdrop, and `Popup`'s own transform/transition
 * classes below are copied from it unchanged. Left uncontrolled (no `open`/`onOpenChange`), the same
 * choice the retired sheet-based version made, since nothing here needs to coordinate open state
 * with anything else the way `nav-menu.tsx`'s own in-page-hash handling does.
 *
 * The drawer's own 56px header is its own -- not `ConsoleMasthead` reused, since it draws different
 * content (Trakline, the Console tag, a close button, no theme toggle) at `nav-menu.tsx`'s
 * `h-16`/64px would misalign the `border-b` from the real masthead sitting above the backdrop, so
 * this uses the console's own 56px instead (task-10-fix-1.md: "it lines up with the masthead").
 */
export function ConsoleRailDrawer({ groups }: { readonly groups: readonly ConsoleNavGroup[] }) {
  return (
    <Drawer.Root swipeDirection="left">
      <Drawer.Trigger
        aria-label={m.nav.openMenu}
        className="flex size-11 shrink-0 items-center justify-center text-ink-2 hover:bg-accent-wash hover:text-ink-1 sm:hidden"
      >
        <LineHorizontal3Filled className="size-5" aria-hidden="true" />
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-sheet bg-backdrop transition-opacity duration-(--duration-base) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-sheet flex justify-start">
          <Drawer.Popup
            className={
              "flex h-dvh w-80 max-w-[86vw] flex-col border-r border-line bg-surface-0 pb-(--safe-bottom) outline-none " +
              "translate-x-(--drawer-swipe-movement-x) transition-transform duration-(--duration-slow) ease-out-expo data-[swiping]:duration-0 " +
              "data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full"
            }
          >
            <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line pl-5 pr-3">
              <Mark size={24} />
              <span className="font-display text-lg font-semibold uppercase tracking-brand">{f.productName}</span>
              <Badge variant="steel" caps>
                {f.consoleTag}
              </Badge>
              <div className="flex-1" />
              <Drawer.Close aria-label={m.nav.closeMenu} className="flex size-11 shrink-0 items-center justify-center text-ink-2 hover:bg-accent-wash hover:text-ink-1">
                <DismissRegular className="size-5" aria-hidden="true" />
              </Drawer.Close>
            </div>
            <Drawer.Title className="sr-only">{m.nav.landmark}</Drawer.Title>
            <Drawer.Content className="min-h-0 flex-1 overflow-y-auto py-3">
              <nav aria-label={m.nav.landmark} className="flex flex-col">
                {groups.map((group) => (
                  <div key={group.group} className="flex flex-col pb-2">
                    <span className="legend px-5 pb-1">{m.nav.groupLabel[group.group]}</span>
                    {group.modules.map((mod) => (
                      <RailRow key={mod.num} mod={mod} rowClassName={PHONE_ROW} />
                    ))}
                  </div>
                ))}
              </nav>
            </Drawer.Content>
            <span className="legend-sm shrink-0 border-t border-line px-5 py-2">{buildLine(env().VERCEL_GIT_COMMIT_SHA, process.env.BUILD_DATE)}</span>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
