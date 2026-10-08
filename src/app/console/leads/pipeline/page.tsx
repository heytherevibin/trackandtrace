import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { consoleEnvironment } from "@/console/auth/session";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import type { BusinessMember } from "@/console/leads/business";
import { AddBusinessLead } from "@/console/leads/business-lead-dialog";
import { readBusinessMembers, readPipeline, type PipelineCard } from "@/console/leads/business-leads";
import { parseLeadFilters, type LeadSearchParams } from "@/console/leads/filters";
import { LeadRecord } from "@/console/leads/lead-record";
import { readLead, readTags, type LeadDetail } from "@/console/leads/leads";
import { LeadsTabs, PIPELINE_HREF } from "@/console/leads/leads-tabs";
import { LeadsHeader } from "@/console/leads/page-header";
import { PipelineBoard } from "@/console/leads/pipeline-board";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const p = consoleMessages.leads.business.board;

export const metadata: Metadata = { title: p.pageTitle };

/**
 * Module 06, Leads, the Business pipeline tab: every lead someone is having a business
 * conversation with, as a card in one of five stages. Owner, Admin and Support; a Viewer is drawn
 * No access, as on the Lifecycle tab.
 *
 * The page is given MASKED addresses. A card opens its lead's record over the board (`?lead=`), the
 * same record the Lifecycle list opens, read the same way. Reading the board or a record writes no
 * audit row; moving, assigning, adding and removing do, and the database writes them
 * (20261008090000_console_business_leads.sql).
 *
 * A board that could not be read is not "no business leads yet".
 */
export default async function PipelinePage({ searchParams }: { readonly searchParams: Promise<LeadSearchParams> }) {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.support) {
    return (
      <ConsoleFrame member={member}>
        <LeadsHeader />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  // Only the open lead's id is read from the address: the board has no filters.
  const lead = parseLeadFilters(await searchParams).lead;
  const db = await createConsoleDb();
  const now = new Date();
  const [cards, members, tags, detail] = await Promise.all([
    readPipeline(db).catch((): readonly PipelineCard[] | null => null),
    readBusinessMembers(db).catch((): readonly BusinessMember[] => []),
    readTags(db).catch((): readonly string[] => []),
    lead === null
      ? null
      : readLead(db, lead).then(
          (record): LeadDetail | "gone" => record ?? "gone",
          (err: unknown): "gone" | "unavailable" => (err instanceof AppError && err.code === "NOT_FOUND" ? "gone" : "unavailable"),
        ),
  ]);
  const add = <AddBusinessLead members={members} me={member.userId} page={PIPELINE_HREF} />;

  return (
    <ConsoleFrame member={member}>
      <LeadsHeader updated={formatTime(now)} phoneNote={p.phone} action={add} />
      <LeadsTabs current="pipeline" />
      <div className="mt-6 max-sm:mt-4">
        <PipelineBoard cards={cards} now={now.toISOString()} action={add} />
      </div>
      {detail !== null && lead !== null ? <LeadRecord leadId={lead} detail={detail} suggestions={tags} members={members} me={member.userId} environment={consoleEnvironment()} closeHref={PIPELINE_HREF} /> : null}
    </ConsoleFrame>
  );
}
