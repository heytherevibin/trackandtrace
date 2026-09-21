import Link from "next/link";
import { consoleMessages } from "@/console/messages";
import type { ConsoleNavGroup } from "@/console/nav";
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
 * The module rail (Main.dc.html): each visible group's legend and its modules, then the build
 * line. ConsoleFrame renders this only once `groups` is non-empty -- in 2d-1 that is never (see
 * nav.ts's own ruling), so this component's tests are what prove the drawing until 2d-2 gives it
 * something to show.
 *
 * VERCEL_GIT_COMMIT_SHA and BUILD_DATE are read here rather than threaded down as props: Next
 * inlines `process.env.BUILD_DATE` at build time only where the literal expression appears
 * (task-4-addendum.md §2), so the read has to live in the component that draws it.
 */
export function ConsoleRail({ groups }: { readonly groups: readonly ConsoleNavGroup[] }) {
  return (
    <nav aria-label={m.nav.landmark} className="flex w-60 shrink-0 flex-col border-r border-line py-5">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col pb-3.5">
          <span className="legend px-6 pb-1.5">{m.nav.groupLabel[group.group]}</span>
          {/* Not `module`: reserved by webpack's module wrapper (@next/next/no-assign-module-variable). */}
          {group.modules.map((mod) => (
            <Link key={mod.num} href={mod.href} className="flex h-9 items-center gap-2.5 pl-6 pr-4 text-label text-ink-2 no-underline hover:bg-accent-wash hover:text-ink-1">
              <span aria-hidden="true" className="font-data tnum w-5 shrink-0 text-label text-ink-3">
                {mod.num}
              </span>
              <span className="flex-1 truncate">{mod.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div className="flex-1" />
      <span className="legend-sm px-6">{buildLine(env().VERCEL_GIT_COMMIT_SHA, process.env.BUILD_DATE)}</span>
    </nav>
  );
}
