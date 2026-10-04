import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { readLetters, type LetterRow } from "@/console/announcements/letters";
import { LettersPlate } from "@/console/announcements/letters-plate";
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
 * Module 07, Announcements: the letters. Owner and Admin, per the role matrix.
 *
 * The guard carries no role floor, for the reason /abuse and /team spell out: a role below it must
 * still come back with a `member` to draw inside ConsoleFrame. The database re-checks the floor on
 * every read (console_letters), so this page's check decides what to DRAW, not what is allowed.
 *
 * A read that fails draws "Letters unavailable", never "No letters yet".
 *
 * The Suppressions tab arrives with its own change; a tab that led nowhere would be worse than none.
 */
export default async function AnnouncementsPage() {
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

  const letters = await readLetters(await createConsoleDb()).catch((): readonly LetterRow[] | null => null);

  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader
        updated={formatTime(new Date())}
        action={
          <Link href={consoleHref("/announcements/new")} className={buttonClassName({ variant: "primary" })}>
            {m.newLetter}
          </Link>
        }
      />
      <div className="mt-6 flex flex-col gap-6">
        <LettersPlate letters={letters} />
      </div>
    </ConsoleFrame>
  );
}
