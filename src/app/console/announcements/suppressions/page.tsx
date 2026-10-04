import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { Lamp } from "@/components/ui/led";
import { AnnouncementsTabs } from "@/console/announcements/announcements-tabs";
import { AnnouncementsHeader } from "@/console/announcements/page-header";
import { operatorsCutOff, readSuppressions, type Suppression } from "@/console/announcements/suppressions";
import { SuppressionsPlate } from "@/console/announcements/suppressions-plate";
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
const s = m.suppressions;

export const metadata: Metadata = { title: s.pageTitle };

/**
 * Module 07, Suppressions: the addresses no mail goes to, and why. Owner and Admin.
 *
 * The page is given masked addresses. A console member's is the exception, and when one of those is
 * suppressed for ALL mail the page says so above the table, because that member's sign-in links
 * have silently stopped arriving and nothing else in the console would tell anyone (spec §5).
 *
 * A read that fails draws "Suppressions unavailable", never "No addresses are suppressed".
 */
export default async function SuppressionsPage() {
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

  const rows = await readSuppressions(await createConsoleDb()).catch((): readonly Suppression[] | null => null);
  const cutOff = rows === null ? [] : operatorsCutOff(rows);

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
      <AnnouncementsTabs current="suppressions" />
      <div className="mt-6 flex flex-col gap-6">
        {cutOff.length > 0 ? (
          <div role="status" className="border-line bg-accent-wash flex items-center gap-3 border px-4 py-3 max-sm:items-start">
            <Lamp variant="ringed" className="max-sm:mt-1.5" />
            <span className="text-sm">
              <strong className="font-semibold">{cutOff.length === 1 ? s.bannerOne : s.bannerMany(cutOff.length)}</strong>
              {s.bannerRest(cutOff.join(", "))}
            </span>
          </div>
        ) : null}
        <SuppressionsPlate rows={rows} />
      </div>
    </ConsoleFrame>
  );
}
