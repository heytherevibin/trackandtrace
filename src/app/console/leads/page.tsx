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
import { readBusinessMembers } from "@/console/leads/business-leads";
import { FiguresPlate } from "@/console/leads/figures-plate";
import { leadQuery, parseLeadFilters, type LeadSearchParams } from "@/console/leads/filters";
import { LeadExportButton, LeadExportProvider, LeadExportStatus } from "@/console/leads/lead-export";
import { readFigures, readLead, readLeads, readTags, type LeadDetail, type LeadFigures, type LeadPage } from "@/console/leads/leads";
import { LeadsBrowser } from "@/console/leads/leads-browser";
import { LeadsTabs } from "@/console/leads/leads-tabs";
import { LeadsHeader } from "@/console/leads/page-header";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.leads;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * Module 06, Leads, the Lifecycle tab: everyone who gave us an email, sign-ups and accounts as one
 * list. The Business pipeline is its other tab (leads/pipeline/page.tsx).
 * Owner, Admin and Support; a Viewer is drawn No access, as the sheet draws it.
 *
 * The page is given MASKED addresses and nothing else. The four filters, the page number and the
 * open lead's id come from the address; an email never does (filters.ts). Reading the list or a
 * record writes no audit row. Revealing an address and looking one up do, and the database writes
 * them (20261005090000_console_leads.sql). Tagging, noting, deleting and exporting are recorded too
 * (20261006090000, 20261007090000); the last two are behind a reason and a key.
 *
 * Each of the reads fails on its own: figures that could not be read are not zeroes, and a
 * list that could not be read is not "No leads yet".
 */
export default async function LeadsPage({ searchParams }: { readonly searchParams: Promise<LeadSearchParams> }) {
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

  const filters = parseLeadFilters(await searchParams);
  const db = await createConsoleDb();
  const now = new Date();
  const [figures, page, tags, members, detail] = await Promise.all([
    readFigures(db).catch((): LeadFigures | null => null),
    readLeads(db, filters, now).catch((): LeadPage | null => null),
    // The Tag filter's choices. Without them the picker offers only the tag already in force, and
    // the list itself is unaffected: a filter is the address's, not the picker's.
    readTags(db).catch((): readonly string[] => []),
    // Who may own a business lead: the Owner picker's choices. Without them a lead can still be
    // read, and nothing can be assigned until the page is read again.
    readBusinessMembers(db).catch((): readonly BusinessMember[] => []),
    filters.lead === null
      ? null
      : readLead(db, filters.lead).then(
          (lead): LeadDetail | "gone" => lead ?? "gone",
          // "No such lead" is an answer; anything else is a read that failed.
          (err: unknown): "gone" | "unavailable" => (err instanceof AppError && err.code === "NOT_FOUND" ? "gone" : "unavailable"),
        ),
  ]);

  // Export is Owner and Admin (the role matrix: Support has Leads "full, but no export"). The
  // database holds the same floor; this only decides whether the button is drawn.
  const canExport = ROLE_RANK[member.role] >= ROLE_RANK.admin;
  const environment = consoleEnvironment();

  return (
    <ConsoleFrame member={member}>
      <LeadExportProvider filters={filters} environment={environment} total={page?.total ?? null}>
        <LeadsHeader
          updated={formatTime(now)}
          phoneNote={canExport ? m.export.phone : undefined}
          action={
            <>
              <AddBusinessLead members={members} me={member.userId} page={leadQuery({ ...filters, lead: null })} />
              {canExport ? <LeadExportButton /> : null}
            </>
          }
        />
        <LeadsTabs current="lifecycle" />
        <div className="mt-6 flex flex-col gap-6 max-sm:mt-4 max-sm:gap-4">
          <FiguresPlate figures={figures} />
          <LeadsBrowser page={page} filters={filters} detail={detail} tags={tags} environment={environment} members={members} me={member.userId} between={<LeadExportStatus />} />
        </div>
      </LeadExportProvider>
    </ConsoleFrame>
  );
}
