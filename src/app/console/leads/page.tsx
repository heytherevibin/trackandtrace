import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { FiguresPlate } from "@/console/leads/figures-plate";
import { parseLeadFilters, type LeadSearchParams } from "@/console/leads/filters";
import { readFigures, readLead, readLeads, readTags, type LeadDetail, type LeadFigures, type LeadPage } from "@/console/leads/leads";
import { LeadsBrowser } from "@/console/leads/leads-browser";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.leads;

export const metadata: Metadata = { title: m.pageTitle };

function Header({ updated }: { readonly updated?: string }) {
  return (
    <header className="mt-6">
      <span className="legend-sm text-accent-text">{m.kicker}</span>
      <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
      <p className="text-ink-1/70 mt-2 max-w-[56ch]">{m.lead}</p>
      {updated ? <p className="legend mt-3">{m.updated(updated)}</p> : null}
    </header>
  );
}

/**
 * Module 06, Leads (first part): everyone who gave us an email, sign-ups and accounts as one list.
 * Owner, Admin and Support; a Viewer is drawn No access, as the sheet draws it.
 *
 * The page is given MASKED addresses and nothing else. The four filters, the page number and the
 * open lead's id come from the address; an email never does (filters.ts). Reading the list or a
 * record writes no audit row. Revealing an address and looking one up do, and the database writes
 * them (20261005090000_console_leads.sql).
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
        <Header />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  const filters = parseLeadFilters(await searchParams);
  const db = await createConsoleDb();
  const now = new Date();
  const [figures, page, tags, detail] = await Promise.all([
    readFigures(db).catch((): LeadFigures | null => null),
    readLeads(db, filters, now).catch((): LeadPage | null => null),
    // The Tag filter's choices. Without them the picker offers only the tag already in force, and
    // the list itself is unaffected: a filter is the address's, not the picker's.
    readTags(db).catch((): readonly string[] => []),
    filters.lead === null
      ? null
      : readLead(db, filters.lead).then(
          (lead): LeadDetail | "gone" => lead ?? "gone",
          // "No such lead" is an answer; anything else is a read that failed.
          (err: unknown): "gone" | "unavailable" => (err instanceof AppError && err.code === "NOT_FOUND" ? "gone" : "unavailable"),
        ),
  ]);

  return (
    <ConsoleFrame member={member}>
      <Header updated={formatTime(now)} />
      <div className="mt-6 flex flex-col gap-6 max-sm:mt-4 max-sm:gap-4">
        <FiguresPlate figures={figures} />
        <LeadsBrowser page={page} filters={filters} detail={detail} tags={tags} />
      </div>
    </ConsoleFrame>
  );
}
