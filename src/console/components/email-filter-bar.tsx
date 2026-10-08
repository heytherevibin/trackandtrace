"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** The bar's words: each module's own, transcribed from its sheet. */
export interface EmailFilterWords {
  /** The name of the whole bar, for a screen reader: "Filter leads". */
  readonly label: string;
  readonly search: string;
  readonly hint: string;
  /** The search applies on Enter; this is its button, for screen readers. */
  readonly find: string;
  readonly legend: string;
  readonly exact: string;
  readonly removeExact: string;
  readonly clear: string;
  /** What part of an address is answered with. */
  readonly notAddress: string;
}

/**
 * A list's filter bar: the search box, the pickers and the chip row (ConsoleLeads.dc.html's, and
 * ConsoleAccounts.dc.html's; on the phone boards the box, its hint, then the pickers two across).
 *
 * THE SEARCH TAKES A WHOLE ADDRESS and applies on Enter. Part of one is refused here, in the form's
 * own words, before any request: every lookup is written to the audit log, and a typo should not be.
 * The address never goes to the page's address; `onFind` sends it in a request body.
 *
 * The pickers are the module's own, drawn twice: a row from `sm` up and a two-column grid below
 * it, each `display: none` at the other width. `pickers` is handed `forget`, which empties the box:
 * a pick drops a search, because a search result is not a filtered list.
 *
 * Lifted out of the Leads filter bar when Accounts needed the same bar, unchanged.
 */
export function EmailFilterBar({
  id,
  words,
  searching,
  searched,
  accept,
  pickers,
  onFind,
  onClearSearch,
  onClearAll,
}: {
  /** A prefix for the ids the box is described by: unique on the page. */
  readonly id: string;
  readonly words: EmailFilterWords;
  readonly searching: boolean;
  /** A search is applied: the chip row is drawn. */
  readonly searched: boolean;
  /** The whole address as it will be sent, or null when what was typed is not one. */
  readonly accept: (draft: string) => string | null;
  readonly pickers: (stacked: boolean, forget: () => void) => ReactNode;
  readonly onFind: (email: string) => void;
  readonly onClearSearch: () => void;
  readonly onClearAll: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === "") return;
    const email = accept(draft);
    setRefused(email === null);
    if (email !== null) onFind(email);
  };

  const forget = () => {
    setDraft("");
    setRefused(false);
  };

  const refusedId = `${id}-find-refused`;
  const hintId = `${id}-find-hint`;

  return (
    <div className="flex flex-col gap-2.5">
      <div role="search" aria-label={words.label} className="flex flex-col gap-2.5 max-sm:gap-2">
        {/* The box and what it does, side by side: the hint is about the search, so it stays with it
            now that the pickers have a row of their own. Where there is no room it goes under. */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <form onSubmit={submit} className="relative w-[300px] max-w-full max-sm:w-full" noValidate>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-ink-3 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              type="search"
              // Not `type="email"`: the browser's own bubble would answer part of an address before this form can.
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              className="well placeholder:text-ink-3 h-10 w-full pl-8 pr-2.5 max-sm:h-11"
              aria-label={words.search}
              aria-describedby={refused ? `${refusedId} ${hintId}` : hintId}
              aria-invalid={refused || undefined}
              aria-busy={searching || undefined}
              placeholder={words.search}
              maxLength={254}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setRefused(false);
              }}
            />
            <button type="submit" className="sr-only" tabIndex={-1}>
              {words.find}
            </button>
          </form>
          <div className="flex min-w-[min(16rem,100%)] flex-1 flex-col gap-1">
            {refused ? (
              <p id={refusedId} role="alert" className="text-label">
                {words.notAddress}
              </p>
            ) : null}
            <p id={hintId} className="text-ink-3 text-label">
              {words.hint}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 max-sm:hidden">{pickers(false, forget)}</div>
        <div className="grid grid-cols-2 gap-2 sm:hidden">{pickers(true, forget)}</div>
      </div>

      {searched ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="legend text-ink-3 max-sm:hidden">{words.legend}</span>
          {/* The whole tag is the control, as the audit log's chips are: one button, one name. */}
          <button
            type="button"
            aria-label={words.removeExact}
            onClick={() => {
              setDraft("");
              onClearSearch();
            }}
            className="press bg-surface-1 text-2xs tracking-head text-ink-2 hover:text-ink-1 max-sm:text-label inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-0 py-[3px] pl-2.5 pr-1 leading-normal max-sm:min-h-11 max-sm:gap-2 max-sm:px-3"
          >
            {words.exact}
            <span className="text-ink-3 inline-flex size-5 items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-2.5 max-sm:size-3">
                <path d="M2 2l6 6M8 2 2 8" />
              </svg>
            </span>
          </button>
          <Button
            variant="ghost"
            className="max-sm:h-11"
            onClick={() => {
              setDraft("");
              onClearAll();
            }}
          >
            {words.clear}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
