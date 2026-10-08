"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/ui/toast";
import { AccountDrawer } from "@/console/accounts/account-drawer";
import { AccountFilterBar } from "@/console/accounts/account-filter-bar";
import type { AccountDetail, AccountPage, AccountRow } from "@/console/accounts/accounts";
import { requestFindAccount, requestRevealAccount } from "@/console/accounts/accounts-client";
import { AccountsPlate, type AccountsState, type ShownAccount } from "@/console/accounts/accounts-plate";
import { ACCOUNT_PAGE_SIZE, NO_ACCOUNT_FILTERS, accountQuery, hasAccountFilters, type AccountFilters } from "@/console/accounts/filters";
import { consoleMessages } from "@/console/messages";
import { formatCount } from "@/utils/datetime";

const t = consoleMessages.accounts.table;

/**
 * The filter bar, the Accounts plate and the record over them (ConsoleAccounts.dc.html), and the
 * one client component on the page.
 *
 * WHAT IS IN THE ADDRESS AND WHAT IS NOT. The three filters, the page and the open account's id
 * are in the address, so the server reads the list and the record and a view can be linked. A
 * searched email and a revealed one are held here, in this component's state, and nowhere else: a
 * reload masks every address again and forgets the search, and a second look is a second audit row.
 *
 * EVERY ADDRESS IS MASKED UNTIL REVEALED. What is revealed is kept by account id and shared by the
 * row and the record, so revealing in one shows in the other.
 *
 * `page` is `null` when the list could not be read. It is never drawn as "no accounts".
 */
export function AccountsBrowser({
  page,
  filters,
  detail,
  environment,
}: {
  readonly page: AccountPage | null;
  readonly filters: AccountFilters;
  /** The deployment, for the acts on a record that are approved under it. */
  readonly environment: string;
  /** The open account's record; why there is none to draw; or null when no record is open. */
  readonly detail: AccountDetail | "unavailable" | "gone" | null;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Readonly<Record<string, string>>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  // A search that has been answered: the one account with that address, or null for nobody.
  const [search, setSearch] = useState<{ readonly account: AccountRow | null } | null>(null);
  const [searching, setSearching] = useState(false);

  async function reveal(id: string): Promise<void> {
    setRevealing(id);
    const outcome = await requestRevealAccount(id);
    setRevealing(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    setRevealed((before) => ({ ...before, [id]: outcome.address }));
  }

  async function find(email: string): Promise<void> {
    setSearching(true);
    const outcome = await requestFindAccount(email);
    setSearching(false);
    if (outcome.kind === "failed") {
      // The list stays as it was: a lookup that failed found out nothing.
      notify.error(outcome.message);
      return;
    }
    setSearch({ account: outcome.account });
  }

  const listed: readonly AccountRow[] = search ? (search.account ? [search.account] : []) : (page?.rows ?? []);
  const rows: readonly ShownAccount[] = listed.map((row) => ({ ...row, shown: revealed[row.id] ?? row.email, hidden: revealed[row.id] === undefined }));

  const state: AccountsState = search ? (search.account ? "rows" : "noMatch") : page === null ? "error" : page.rows.length > 0 ? "rows" : hasAccountFilters(filters) ? "filtered" : "empty";

  const total = page?.total ?? 0;
  const first = (filters.page - 1) * ACCOUNT_PAGE_SIZE + 1;
  const last = Math.min(filters.page * ACCOUNT_PAGE_SIZE, total);
  const range = search ? t.range("1", "1", "1") : t.range(formatCount(first), formatCount(last), formatCount(total));
  const cell = search ? (search.account ? t.oneMatch : t.noMatch) : state === "rows" ? range : t.blank;

  const open = filters.account;
  const paged = (to: number) => accountQuery({ ...filters, page: to, account: null });
  const closeHref = accountQuery({ ...filters, account: null });

  return (
    <>
      <AccountFilterBar
        filters={filters}
        searching={searching}
        searched={search !== null}
        onFind={(email) => void find(email)}
        onPick={(next) => {
          setSearch(null);
          router.push(accountQuery(next));
        }}
        onClearSearch={() => setSearch(null)}
        onClearAll={() => {
          setSearch(null);
          if (hasAccountFilters(filters)) router.push(accountQuery(NO_ACCOUNT_FILTERS));
        }}
      />
      <AccountsPlate
        state={state}
        rows={rows}
        cell={cell}
        pager={{ range, previous: !search && filters.page > 1 ? paged(filters.page - 1) : null, next: !search && last < total ? paged(filters.page + 1) : null }}
        openId={open}
        revealing={revealing}
        hrefFor={(row) => accountQuery({ ...filters, account: row.id })}
        clearHref={accountQuery(NO_ACCOUNT_FILTERS)}
        onReveal={(row) => void reveal(row.id)}
        onRetry={() => router.refresh()}
      />
      {detail !== null && open !== null ? (
        <AccountDrawer
          detail={detail}
          revealed={revealed[open] ?? null}
          revealing={revealing === open}
          environment={environment}
          onReveal={() => void reveal(open)}
          // The record stays open and is read again, with the list behind it: a disabled account
          // changes its row too.
          onChanged={() => router.refresh()}
          onClose={() => router.push(closeHref)}
        />
      ) : null}
    </>
  );
}
