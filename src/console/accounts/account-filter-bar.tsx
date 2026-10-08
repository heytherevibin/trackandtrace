"use client";

import { ACCOUNT_STATES, CREATED_RANGES, SIGN_IN_METHODS, type AccountFilters } from "@/console/accounts/filters";
import { findBody } from "@/console/accounts/routes";
import { EmailFilterBar } from "@/console/components/email-filter-bar";
import { Picker } from "@/console/components/picker";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.accounts;
const f = m.filters;

function among<T extends string>(values: readonly T[], value: string): T | null {
  return values.find((one) => one === value) ?? null;
}

/**
 * The search box, the three pickers and the chip row (ConsoleAccounts.dc.html's filter bar, and
 * the phone board's: the box, its hint, then the pickers two across). The bar itself is the
 * console's shared one (email-filter-bar.tsx); the three pickers and what a pick does are this
 * module's.
 */
export function AccountFilterBar({
  filters,
  searching,
  searched,
  onPick,
  onFind,
  onClearSearch,
  onClearAll,
}: {
  readonly filters: AccountFilters;
  readonly searching: boolean;
  /** A search is applied: the chip row is drawn. */
  readonly searched: boolean;
  readonly onPick: (next: AccountFilters) => void;
  readonly onFind: (email: string) => void;
  readonly onClearSearch: () => void;
  readonly onClearAll: () => void;
}) {
  const pickers = (stacked: boolean, forget: () => void) => {
    // Every pick goes back to page one with no record open, and drops a search: a narrower set has
    // fewer pages, and a search result is not a filtered list.
    const pick = (next: Partial<AccountFilters>) => {
      forget();
      onPick({ ...filters, ...next, page: 1, account: null });
    };
    return (
      <>
        <Picker stacked={stacked} label={f.status} all={f.all} value={filters.status ?? ""} options={ACCOUNT_STATES.map((one) => ({ value: one, label: m.status[one] }))} onPick={(value) => pick({ status: among(ACCOUNT_STATES, value) })} />
        <Picker stacked={stacked} label={f.method} all={f.all} value={filters.method ?? ""} options={SIGN_IN_METHODS.map((one) => ({ value: one, label: m.methods[one] }))} onPick={(value) => pick({ method: among(SIGN_IN_METHODS, value) })} />
        {/* The sheet sets Created against the row's right edge, apart from the two facts about an
            account; on a phone it is the third of three in two columns, and takes the last row whole. */}
        {stacked ? null : <span className="grow" />}
        <div className={stacked ? "col-span-2" : "contents"}>
          <Picker stacked={stacked} label={f.created} all={f.anyTime} value={filters.created === "any" ? "" : filters.created} options={CREATED_RANGES.map((one) => ({ value: one, label: m.created[one] }))} onPick={(value) => pick({ created: among(CREATED_RANGES, value) ?? "any" })} />
        </div>
      </>
    );
  };

  return (
    <EmailFilterBar
      id="ac"
      words={{ label: f.label, search: f.search, hint: f.hint, find: f.find, legend: f.legend, exact: f.exact, removeExact: f.removeExact, clear: f.clear, notAddress: m.errors.notAddress }}
      searching={searching}
      searched={searched}
      accept={(draft) => {
        const body = findBody.safeParse({ email: draft });
        return body.success ? body.data.email : null;
      }}
      pickers={pickers}
      onFind={onFind}
      onClearSearch={onClearSearch}
      onClearAll={onClearAll}
    />
  );
}
