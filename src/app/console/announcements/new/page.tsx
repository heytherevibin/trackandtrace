import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { ComposeForm } from "@/console/announcements/compose-form";
import { ComposeReadonly } from "@/console/announcements/compose-readonly";
import { lettersAhead } from "@/console/announcements/estimate";
import { HowPlate } from "@/console/announcements/how-plate";
import { readLetters, readLists } from "@/console/announcements/letters";
import { AnnouncementsHeader } from "@/console/announcements/page-header";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.announcements;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * A new letter. Nothing exists until Save draft, which moves to the draft's own address
 * (/announcements/<id>); so a reload here is always an empty form, never a half-saved one.
 */
export default async function NewLetterPage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.admin) {
    return (
      <ConsoleFrame member={member}>
        <AnnouncementsHeader />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  const db = await createConsoleDb();
  const now = new Date();
  // Both throw on a database fault, and this page has nothing true to draw without them: the
  // console's error boundary (src/app/console/error.tsx) says so, rather than a form that offers
  // lists it could not count.
  const [lists, letters] = await Promise.all([readLists(db), readLetters(db)]);
  const ahead = lettersAhead(letters, { id: null, queuedAt: null });

  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader
        updated={formatTime(now)}
        action={
          <Link href={consoleHref("/announcements")} className={buttonClassName({ variant: "secondary" })}>
            {m.allLetters}
          </Link>
        }
      />
      <div className="mt-6 grid items-start gap-6 max-sm:hidden lg:grid-cols-[minmax(0,1fr)_340px]">
        <ComposeForm letter={null} lists={lists} email={member.email} ahead={ahead} now={now.toISOString()} />
        <HowPlate titleId="an-how" />
      </div>
      <div className="mt-6 flex flex-col gap-6 sm:hidden">
        <ComposeReadonly letter={null} lists={lists} />
        <HowPlate titleId="an-how-phone" />
      </div>
    </ConsoleFrame>
  );
}
