"use client";

import { RecordAddress, RecordDrawer } from "@/console/components/record-drawer";
import { Facts, RecordSection } from "@/console/components/record-section";
import type { BusinessMember } from "@/console/leads/business";
import { BusinessSection } from "@/console/leads/lead-business";
import { DeleteSection } from "@/console/leads/lead-delete";
import { NotesSection, TagsSection } from "@/console/leads/lead-marks";
import type { LeadBusiness, LeadDetail, LeadNote } from "@/console/leads/leads";
import { NewsTag } from "@/console/leads/news-tag";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.leads;
const r = m.record;

type Consent = LeadDetail["consents"][number];
type Event = LeadDetail["timeline"][number];

function consentLine(c: Consent): string {
  return (
    r.consented(formatDateTime(c.consentedAt), r.via[c.source], c.noticeVersion) +
    (c.confirmedAt ? r.confirmed(formatDateTime(c.confirmedAt)) : r.notConfirmed) +
    (c.withdrawnAt ? r.withdrawn(formatDateTime(c.withdrawnAt)) : "")
  );
}

/** One line of the timeline, in the sheet's words. A list or a source that is missing reads as nothing. */
function eventText(e: Event): string {
  const list = e.list ? r.lists[e.list] : "";
  if (e.kind === "signed_up") return r.events.signed_up(list, e.source ? r.via[e.source] : "");
  if (e.kind === "confirmed") return r.events.confirmed(list);
  if (e.kind === "unsubscribed") return r.events.unsubscribed(list);
  if (e.kind === "received") return r.events.received(e.subject ?? "");
  if (e.kind === "added_by_hand") return r.events.added_by_hand(e.by ?? null);
  return r.events[e.kind];
}

function Record({ detail }: { readonly detail: LeadDetail }) {
  const account = detail.account;
  const methods = account ? [account.emailLink ? r.emailLink : null, account.google ? r.google : null, account.passkeys > 0 ? r.passkeys(account.passkeys) : null].filter((x): x is string => x !== null) : [];
  return (
    <>
      <RecordSection title={r.subscriptions}>
        <div className="flex flex-col gap-3">
          {(["news", "availability"] as const).map((list) => {
            const consent = detail.consents.find((c) => c.list === list);
            return (
              <div key={list} className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-2.5">
                  <span className="text-sm font-medium">{r.lists[list]}</span>
                  {consent ? <NewsTag status={consent.status} /> : null}
                </span>
                <span className={consent ? "text-ink-2 text-label" : "text-ink-3 text-label"}>{consent ? consentLine(consent) : r.notOnList}</span>
              </div>
            );
          })}
        </div>
      </RecordSection>
      <RecordSection title={r.accountTitle} tight={account !== null}>
        {account ? (
          <>
            {account.disabled ? <p className="text-ink-2 text-label pt-1.5">{r.disabled}</p> : null}
            <Facts
              items={[
                [r.created, r.at(formatDateTime(account.createdAt))],
                [r.lastSignIn, account.lastSignInAt ? r.at(formatDateTime(account.lastSignInAt)) : r.never],
                [r.signIn, methods.length > 0 ? methods.join(" · ") : m.table.blank],
                // A count, and only ever a count: the console never shows a saved PNR.
                [r.savedPnrs, r.pnrs(formatCount(account.savedPnrs))],
              ]}
            />
          </>
        ) : (
          <p className="text-ink-3 text-label">{r.noAccount}</p>
        )}
      </RecordSection>
      <RecordSection title={r.campaignTitle} tight={detail.campaign !== null}>
        {detail.campaign ? (
          <Facts
            items={[
              [r.source, detail.campaign.source ?? m.table.blank],
              [r.medium, detail.campaign.medium ?? m.table.blank],
              [r.campaign, detail.campaign.name ?? m.table.blank],
              [r.firstPage, detail.campaign.firstPage ?? m.table.blank],
            ]}
          />
        ) : (
          <p className="text-ink-3 text-label">{r.noCampaign}</p>
        )}
      </RecordSection>
      <RecordSection title={r.timeline}>
        <ol className="flex flex-col gap-2.5">
          {detail.timeline.map((e, i) => (
            <li key={`${e.at}-${e.kind}-${i}`} className="flex flex-col gap-0.5">
              <span className="legend-sm tnum">{r.at(formatDateTime(e.at))}</span>
              <span className="text-sm">{eventText(e)}</span>
            </li>
          ))}
        </ol>
      </RecordSection>
    </>
  );
}

/**
 * One lead's record (ConsoleLeads.dc.html, Drawer and Drawer revealed), in the shell every record
 * shares (record-drawer.tsx). The address is masked until Reveal, which the database records; the
 * retention line below never scrolls away. It ends with the lead's tags and notes (lead-marks.tsx), its place in the
 * business pipeline (lead-business.tsx) and Delete (lead-delete.tsx), which a desktop can use and
 * a phone can only read past.
 *
 * `detail` is the record, or why there is none to draw: it could not be read, or the lead is gone.
 */
export function LeadDrawer({
  detail,
  revealed,
  revealing,
  tags,
  notes,
  suggestions,
  business,
  members,
  me,
  environment,
  onReveal,
  onTag,
  onUntag,
  onNote,
  onBusiness,
  onDeleted,
  onClose,
}: {
  readonly detail: LeadDetail | "unavailable" | "gone";
  /** The whole address, once it has been revealed on this visit. */
  readonly revealed: string | null;
  readonly revealing: boolean;
  /** The lead's tags and notes as they stand now: the record's own, or a write's answer since. */
  readonly tags: readonly string[];
  readonly notes: readonly LeadNote[];
  /** Every tag in use, offered as one is typed. */
  readonly suggestions: readonly string[];
  /** The lead's place in the business pipeline as it stands now, or null. */
  readonly business: LeadBusiness | null;
  /** Who may own a business lead, and the signed-in member among them. */
  readonly members: readonly BusinessMember[];
  readonly me: string;
  /** The deployment a delete is approved under: part of what its key tap is minted over. */
  readonly environment: string;
  readonly onReveal: () => void;
  readonly onTag: (tag: string) => Promise<boolean>;
  readonly onUntag: (tag: string) => Promise<boolean>;
  readonly onNote: (body: string) => Promise<boolean>;
  readonly onBusiness: (business: LeadBusiness | null) => void;
  /** The lead was deleted: there is no record left to show. */
  readonly onDeleted: () => void;
  readonly onClose: () => void;
}) {
  const record = typeof detail === "string" ? null : detail;
  const kept = business !== null || (record?.timeline.some((event) => event.kind === "added_by_hand") ?? false);
  return (
    // A lead added by hand has given no consent and is not cleaned up after seven days, in the
    // pipeline or out of it; nor is anyone while they are in it. The closing line says which.
    <RecordDrawer title={r.title} meta={record ? r.firstSeen(formatDate(record.firstSeen)) : null} regionLabel={r.details} footer={kept ? m.business.kept : r.retention} onClose={onClose}>
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
          <Record detail={record} />
          <TagsSection tags={tags} suggestions={suggestions} onAdd={onTag} onRemove={onUntag} />
          <NotesSection notes={notes} onAdd={onNote} />
          <BusinessSection lead={record} business={business} members={members} me={me} onChange={onBusiness} />
          <DeleteSection lead={record} environment={environment} tags={tags.length} notes={notes.length} onDeleted={onDeleted} />
          {/* The phone board's closing line: there, the record is read and nothing is changed. */}
          <p className="border-line text-ink-2 text-label border-t px-4 pb-4 pt-3.5 sm:hidden">{r.largerScreen}</p>
        </>
      )}
    </RecordDrawer>
  );
}
