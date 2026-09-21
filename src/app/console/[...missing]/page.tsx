import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { StateBlock } from "@/components/ui/state-block";
import { requireConsoleMember } from "@/console/auth/guard";
import { ConsoleFrame } from "@/console/components/console-frame";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const m = consoleMessages.frame.states;

/**
 * Unknown console addresses. A visitor with no session still goes to sign in, unchanged; a signed-in
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
  // Only a missing or ended session sends anyone to sign in -- the same narrowing
  // src/app/console/keys/page.tsx carries, and for the same reason. A console whose grants are
  // wrong, or a database that is down, is a fault; swallowing it here would send a member to /login
  // looking like an ordinary sign-out while the real cause went unreported. A rethrow reaches
  // src/app/console/error.tsx, which is what that boundary is for.
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
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
