import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { ConsoleMember } from "@/console/auth/member";
import { ConsoleClock } from "@/console/components/console-clock";
import { ConsoleMasthead } from "@/console/components/console-masthead";
import { ConsoleRail, ConsoleRailSheet } from "@/console/components/console-rail";
import { EnvStrip } from "@/console/components/env-strip";
import { MemberMenu } from "@/console/components/member-menu";
import { railFor } from "@/console/nav";
import { env } from "@/services/env";

/**
 * The signed-in frame (Main.dc.html): the environment strip, the masthead (its clock and member
 * menu filling the slots ConsoleMasthead now takes), the module rail, then the page. A server
 * component -- it takes `member` as a prop rather than calling requireConsoleMember() itself, so
 * a page calls the guard once and passes the result down (task-4-brief.md).
 *
 * ConsoleRail (desktop, `sm:` and up) and ConsoleRailSheet (phone, its bottom-sheet counterpart,
 * task-10-brief.md) are two views of the one `groups`, gated together: a role railFor gives nothing
 * gets neither, not an empty rail beside a working trigger or the reverse (task-10-addendum.md §1 --
 * true of every role today, since no module is built yet; nav.test.ts's and console-rail.test.tsx's
 * own "today's reality" checks pin this and will need updating the day that changes).
 *
 * Like SignedOutFrame (its signed-out counterpart), this reads next/headers and so can only be
 * rendered by Next itself, not by @testing-library/react -- see tests/unit/console/unavailable.test.tsx's
 * own note on the same point. nav.ts's railFor and CONSOLE_MODULES, and ConsoleClock, ConsoleRail,
 * ConsoleRailSheet and MemberMenu themselves, carry this task's test coverage instead.
 */
export async function ConsoleFrame({ member, children }: { readonly member: ConsoleMember; readonly children: ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  const groups = railFor(member.role);
  return (
    <div className="flex min-h-dvh flex-col">
      <EnvStrip production={env().VERCEL_ENV === "production"} host={host} />
      <ConsoleMasthead clock={<ConsoleClock />} member={<MemberMenu member={member} />} />
      <div className="flex min-h-0 flex-1">
        {groups.length > 0 ? (
          <>
            <ConsoleRail groups={groups} />
            <ConsoleRailSheet groups={groups} />
          </>
        ) : null}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
