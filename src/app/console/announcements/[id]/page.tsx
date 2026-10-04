import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { buttonClassName } from "@/components/ui/button";
import { ComposeForm, type ComposeLetter } from "@/console/announcements/compose-form";
import { ComposeReadonly } from "@/console/announcements/compose-readonly";
import { lettersAhead } from "@/console/announcements/estimate";
import { HowPlate } from "@/console/announcements/how-plate";
import { readLetter, readLetters, readLists } from "@/console/announcements/letters";
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
 * One letter. A draft opens in Compose; anything else opens its detail (Task 11 adds that branch).
 * An id that is not one, or names no letter, is the console's not-found page: the address is typed
 * or stale, and there is nothing of this module's to draw.
 */
export default async function LetterPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
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

  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const db = await createConsoleDb();
  const now = new Date();
  const [letter, letters] = await Promise.all([readLetter(db, id), readLetters(db)]);
  if (!letter) notFound();

  const back = (
    <Link href={consoleHref("/announcements")} className={buttonClassName({ variant: "secondary" })}>
      {m.allLetters}
    </Link>
  );

  if (letter.state === "draft") {
    const lists = await readLists(db);
    const draft: ComposeLetter = { id: letter.id, list: letter.list, subject: letter.subject, body: letter.body, testSentAt: letter.testSentAt, testSentTo: letter.testSentTo };
    const ahead = lettersAhead(letters, { id: null, queuedAt: null });
    return (
      <ConsoleFrame member={member}>
        <AnnouncementsHeader updated={formatTime(now)} action={back} />
        <div className="mt-6 grid items-start gap-6 max-sm:hidden lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Keyed by what is saved: after a save or a test the server's copy is the form's new start. */}
          <ComposeForm key={`${letter.id}:${letter.testSentAt ?? ""}`} letter={draft} lists={lists} email={member.email} ahead={ahead} now={now.toISOString()} />
          <HowPlate titleId="an-how" />
        </div>
        <div className="mt-6 flex flex-col gap-6 sm:hidden">
          <ComposeReadonly letter={draft} lists={lists} />
          <HowPlate titleId="an-how-phone" />
        </div>
      </ConsoleFrame>
    );
  }

  // Task 11 replaces this with the Progress and Letter plates.
  return (
    <ConsoleFrame member={member}>
      <AnnouncementsHeader updated={formatTime(now)} action={back} />
    </ConsoleFrame>
  );
}
