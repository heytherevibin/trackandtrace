"use client";

import Link from "next/link";
import { ActsSections } from "@/console/accounts/account-acts";
import type { AccountDetail } from "@/console/accounts/accounts";
import { leadHref, StatusTag } from "@/console/accounts/accounts-plate";
import { signInLine } from "@/console/accounts/sign-in";
import { RecordAddress, RecordDrawer } from "@/console/components/record-drawer";
import { Facts, RecordSection } from "@/console/components/record-section";
import { NewsTag } from "@/console/leads/news-tag";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.accounts;
const r = m.record;

function Record({ detail, shown }: { readonly detail: AccountDetail; readonly shown: string }) {
  const sessions = detail.sessions;
  return (
    <>
      <RecordSection title={r.status}>
        {detail.disabled ? (
          <div className="flex flex-col gap-1.5">
            <span>
              <StatusTag disabled />
            </span>
            {/* Since when and by whom, when the console disabled it; an account disabled from
                outside the console has neither on record. */}
            <span className="text-ink-2 text-label">{detail.disabledAt && detail.disabledBy ? r.cannotSignInSince(formatDateTime(detail.disabledAt), detail.disabledBy) : r.cannotSignIn}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{r.active}</span>
            <span className="text-ink-2 text-label">{r.canSignIn}</span>
          </div>
        )}
      </RecordSection>
      <RecordSection title={r.account} tight>
        <Facts
          items={[
            [r.created, r.at(formatDateTime(detail.createdAt))],
            [r.lastSignIn, detail.lastSignInAt ? r.at(formatDateTime(detail.lastSignInAt)) : m.table.never],
            [r.signIn, signInLine(detail)],
            // A count, and only ever a count: the console never shows a saved PNR.
            [r.savedPnrs, formatCount(detail.savedPnrs)],
          ]}
        />
      </RecordSection>
      <RecordSection title={r.sessions} tight={sessions.count > 0}>
        {sessions.count > 0 ? (
          <Facts
            items={[
              [r.signedIn, r.sessionCount(sessions.count)],
              [r.lastSeen, sessions.lastSeenAt ? r.at(formatDateTime(sessions.lastSeenAt)) : m.table.blank],
            ]}
          />
        ) : (
          <p className="text-ink-3 text-label">{r.nobody}</p>
        )}
      </RecordSection>
      <RecordSection title={r.news}>
        <div className="flex items-center gap-3">
          <NewsTag status={detail.news} />
          <Link href={leadHref(detail)} prefetch={false} aria-label={r.openLeadLabel(shown)} className="text-accent-text text-label underline underline-offset-4">
            {r.openLead}
          </Link>
        </div>
        <p className="text-ink-3 text-label mt-2">{r.separate}</p>
      </RecordSection>
    </>
  );
}

/**
 * One account's record (ConsoleAccounts.dc.html, Record and Record revealed), in the shell every
 * record shares (record-drawer.tsx). The address is masked until Reveal, which the database
 * records; the closing line, that saved PNRs stay private, never scrolls away. It ends with the
 * acts (account-acts.tsx), which a desktop can use and a phone can only read past.
 *
 * `detail` is the record, or why there is none to draw: it could not be read, or the account is gone.
 */
export function AccountDrawer({
  detail,
  revealed,
  revealing,
  environment,
  onReveal,
  onChanged,
  onClose,
}: {
  readonly detail: AccountDetail | "unavailable" | "gone";
  /** The whole address, once it has been revealed on this visit. */
  readonly revealed: string | null;
  readonly revealing: boolean;
  /** The deployment an act is approved under: part of what its key tap is minted over. */
  readonly environment: string;
  readonly onReveal: () => void;
  /** An act went through: the record and the list behind it are out of date. */
  readonly onChanged: () => void;
  readonly onClose: () => void;
}) {
  const record = typeof detail === "string" ? null : detail;
  return (
    <RecordDrawer title={r.title} meta={record ? r.createdOn(formatDate(record.createdAt)) : null} regionLabel={r.details} footer={r.private} onClose={onClose}>
      {record === null ? (
        <p role={detail === "unavailable" ? "alert" : "status"} className="px-5 py-4 text-sm max-sm:px-4">
          {detail === "unavailable" ? r.unavailable : r.gone}
        </p>
      ) : (
        <>
          <RecordAddress
            masked={record.email}
            revealed={revealed}
            revealing={revealing}
            words={{ reveal: m.table.reveal, revealLabel: m.table.revealLabel(record.email), revealedLine: r.revealed }}
            onReveal={onReveal}
          />
          <Record detail={record} shown={revealed ?? record.email} />
          <ActsSections account={record} shown={revealed ?? record.email} environment={environment} onDone={onChanged} />
          {/* The phone board's closing line: there, the record is read and nothing is changed. */}
          <p className="border-line text-ink-2 text-label border-t px-4 pb-4 pt-3.5 sm:hidden">{r.largerScreen}</p>
        </>
      )}
    </RecordDrawer>
  );
}
