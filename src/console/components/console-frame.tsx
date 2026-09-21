import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { ConsoleMember } from "@/console/auth/member";
import { ConsoleMasthead } from "@/console/components/console-masthead";
import { ConsoleRail } from "@/console/components/console-rail";
import { EnvStrip } from "@/console/components/env-strip";
import { MemberMenu } from "@/console/components/member-menu";
import { railFor } from "@/console/nav";
import { env } from "@/services/env";

/**
 * The signed-in frame (Main.dc.html): the environment strip, the masthead with the member menu,
 * the module rail, then the page. A server component -- it takes `member` as a prop rather than
 * calling requireConsoleMember() itself, so a page calls the guard once and passes the result
 * down (task-4-brief.md).
 *
 * ConsoleMasthead ships fixed (no slot for the member menu): the wrapper below gives it a
 * `flex-1` sizing context from the outside, so its own internal spacer still pushes the theme
 * button to its right edge, which is exactly where MemberMenu picks up -- one continuous
 * bordered row, without touching the masthead's own source. Main.dc.html's clock has no task or
 * interface behind it yet and is not drawn here.
 *
 * Like SignedOutFrame (its signed-out counterpart), this reads next/headers and so can only be
 * rendered by Next itself, not by @testing-library/react -- see tests/unit/console/unavailable.test.tsx's
 * own note on the same point. nav.ts's railFor and CONSOLE_MODULES, and ConsoleRail and MemberMenu
 * themselves, carry this task's test coverage instead.
 */
export async function ConsoleFrame({ member, children }: { readonly member: ConsoleMember; readonly children: ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  const groups = railFor(member.role);
  return (
    <div className="flex min-h-dvh flex-col">
      <EnvStrip production={env().VERCEL_ENV === "production"} host={host} />
      <div className="flex">
        <div className="min-w-0 flex-1">
          <ConsoleMasthead />
        </div>
        <div className="flex h-14 shrink-0 items-center border-b border-line pr-4 sm:pr-6">
          <MemberMenu member={member} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {groups.length > 0 ? <ConsoleRail groups={groups} /> : null}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
