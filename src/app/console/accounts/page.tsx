import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readAccount, readAccounts, type AccountDetail, type AccountPage } from "@/console/accounts/accounts";
import { AccountsBrowser } from "@/console/accounts/accounts-browser";
import { parseAccountFilters, type AccountSearchParams } from "@/console/accounts/filters";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.accounts;

export const metadata: Metadata = { title: m.pageTitle };

/** The page header (ConsoleAccounts.dc.html): kicker, title, lead and the "Updated" line. No-access draws it without the line. */
function AccountsHeader({ updated }: { readonly updated?: string }) {
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
 * Module 08, Accounts: the traveller accounts. Owner and Admin; Support and a Viewer are drawn No
 * access, as the sheet draws it.
 *
 * The page is given MASKED addresses and a COUNT of saved PNRs, and nothing else about either. The
 * three filters, the page number and the open account's id come from the address; an email never
 * does (filters.ts). Reading the list or a record writes no audit row. Revealing an address and
 * looking one up do, and the database writes them (20261010090000_console_accounts.sql).
 *
 * Each read fails on its own: a list that could not be read is not "No accounts yet", and a record
 * that could not be read does not take the list down with it.
 */
export default async function AccountsPage({ searchParams }: { readonly searchParams: Promise<AccountSearchParams> }) {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.admin) {
    return (
      <ConsoleFrame member={member}>
        <AccountsHeader />
        <div className="mt-6">
          <NoAccessState role={member.role} />
        </div>
      </ConsoleFrame>
    );
  }

  const filters = parseAccountFilters(await searchParams);
  const db = await createConsoleDb();
  const now = new Date();
  const [page, detail] = await Promise.all([
    readAccounts(db, filters, now).catch((): AccountPage | null => null),
    filters.account === null
      ? null
      : readAccount(db, filters.account).then(
          (account): AccountDetail | "gone" => account ?? "gone",
          (): "unavailable" => "unavailable",
        ),
  ]);

  return (
    <ConsoleFrame member={member}>
      <AccountsHeader updated={formatTime(now)} />
      <div className="mt-6 flex flex-col gap-6 max-sm:mt-4 max-sm:gap-4">
        <AccountsBrowser page={page} filters={filters} detail={detail} />
      </div>
    </ConsoleFrame>
  );
}
