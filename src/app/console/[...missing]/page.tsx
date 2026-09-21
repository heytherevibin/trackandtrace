import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { StateBlock } from "@/components/ui/state-block";
import { requireConsoleMember } from "@/console/auth/guard";
import { ConsoleFrame } from "@/console/components/console-frame";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.frame.states;

/**
 * Unknown console addresses. A signed-out visitor still goes to sign in, unchanged; a signed-in
 * member now sees a not-found state inside their own frame instead of also being bounced to sign
 * in (task-5-brief.md's table doesn't cover this case -- no console sheet draws a 404, grepped --
 * so its copy is new, not transcribed; see task-5-report.md).
 *
 * Not next/navigation's notFound(): docs/superpowers/specs/2026-09-19-phase-2-admin-core-design.md:48
 * already recorded that calling it from a traveller catch-all rendered the not-found page only on
 * the client, breaking the no-JS 404 there. Rendering the state directly, the way that fix and
 * src/app/global-not-found.tsx both do, avoids that failure mode here too.
 */
export default async function ConsoleMissing() {
  const member = await requireConsoleMember().catch(() => null);
  if (!member) redirect(consoleHref("/login"));
  return (
    <ConsoleFrame member={member}>
      <StateBlock
        headingLevel={1}
        title={m.notFound.title}
        detail={m.notFound.detail}
        className="max-w-[720px]"
        actions={
          <Link href={consoleHref("/")} className={buttonClassName({ variant: "secondary" })}>
            {m.noAccess.action}
          </Link>
        }
      />
    </ConsoleFrame>
  );
}
