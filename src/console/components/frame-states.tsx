import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { StateBlock } from "@/components/ui/state-block";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.frame.states;

/**
 * Main.dc.html's pageNoAccess state: a role opened a module it can't (task-5-brief.md's table).
 * `role` is the member's own -- the sheet draws it for Support only as its one example
 * (Main.dc.html:286). No `role="alert"`: the sheet's no-access <section> carries none
 * (Main.dc.html:163), unlike the error state next to it -- see src/app/console/error.tsx.
 *
 * Not wired to a page yet: no module has a built page in this phase (src/console/nav.ts), so there
 * is nowhere real for this to be thrown from until one does. Task 5's report says so.
 */
export function NoAccessState({ role }: { readonly role: ConsoleRole }) {
  return (
    <StateBlock
      title={m.noAccess.title(consoleMessages.frame.roleLabel[role])}
      detail={m.noAccess.detail}
      className="max-w-[720px]"
      actions={
        // Ruling (task-5-brief.md, corrected by task-5-addendum.md §4): Overview doesn't exist yet,
        // so this goes to "/", which itself redirects to /keys (src/app/console/page.tsx) until 2f
        // makes "/" Overview -- remove that redirect then, and this link keeps working unchanged.
        <Link href={consoleHref("/")} className={buttonClassName({ variant: "secondary" })}>
          {m.noAccess.action}
        </Link>
      }
    />
  );
}

/**
 * Main.dc.html's pageSessionEnded state: a full takeover replacing the rail and main both (the
 * sheet turns showFrame and showMember off together for this state, Main.dc.html:345), so it is the
 * page's only heading -- h1, and still no role (Main.dc.html:186-193), unlike the error state.
 *
 * Not wired to a page yet (task-5-addendum.md §2): nothing in this phase detects a session ending
 * mid-visit to show it from. Task 5's report says so.
 */
export function SessionEndedState() {
  return (
    <StateBlock
      headingLevel={1}
      title={m.sessionEnded.title}
      detail={m.sessionEnded.detail}
      className="w-full max-w-[480px]"
      actions={
        <Link href={consoleHref("/login")} className={buttonClassName({ variant: "primary" })}>
          {m.sessionEnded.action}
        </Link>
      }
    />
  );
}
