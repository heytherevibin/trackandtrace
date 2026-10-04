"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { DismissRegular } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { IconButton } from "@/components/ui/icon-button";
import type { LeadDetail } from "@/console/leads/leads";
import { NewsTag } from "@/console/leads/news-tag";
import { consoleMessages } from "@/console/messages";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
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
  return r.events[e.kind];
}

/** `tight` is the heading over a list of facts, whose first row brings its own 10px. */
function Section({ title, tight = false, children }: { readonly title: string; readonly tight?: boolean; readonly children: ReactNode }) {
  return (
    <div className="border-line border-t px-5 pb-4 pt-3.5 max-sm:px-4">
      <h3 className={cn("legend", tight ? "mb-1" : "mb-2.5")}>{title}</h3>
      {children}
    </div>
  );
}

/** The sheet's `.kv` with its label column at the drawn 120px, which the shared list's 35% is not. */
function Facts({ items }: { readonly items: readonly (readonly [string, string])[] }) {
  return (
    // Both cells fill the row and share one 24px line, so the two halves of a row's hairline meet
    // and the label still sits on the value's first line when the value takes two.
    <dl className="grid grid-cols-[120px_1fr] gap-x-4">
      {items.map(([label, value], i) => (
        <div key={label} className="contents">
          <dt className={cn("legend-sm py-2.5 leading-6", i > 0 && "border-line border-t")}>{label}</dt>
          <dd className={cn("text-body min-w-0 py-2.5 leading-6 [overflow-wrap:anywhere]", i > 0 && "border-line border-t")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Record({ detail }: { readonly detail: LeadDetail }) {
  const account = detail.account;
  const methods = account ? [account.emailLink ? r.emailLink : null, account.google ? r.google : null, account.passkeys > 0 ? r.passkeys(account.passkeys) : null].filter((x): x is string => x !== null) : [];
  return (
    <>
      <Section title={r.subscriptions}>
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
      </Section>
      <Section title={r.accountTitle} tight={account !== null}>
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
      </Section>
      <Section title={r.campaignTitle} tight={detail.campaign !== null}>
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
      </Section>
      <Section title={r.timeline}>
        <ol className="flex flex-col gap-2.5">
          {detail.timeline.map((e, i) => (
            <li key={`${e.at}-${e.kind}-${i}`} className="flex flex-col gap-0.5">
              <span className="legend-sm tnum">{r.at(formatDateTime(e.at))}</span>
              <span className="text-sm">{eventText(e)}</span>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

/**
 * One lead's record (ConsoleLeads.dc.html, Drawer and Drawer revealed): a 480px plate against the
 * right edge on a desktop, the full screen on a phone, in the geometry of the audit log's entry
 * drawer. The address is masked until Reveal, which the database records; the retention line below
 * never scrolls away.
 *
 * `detail` is the record, or why there is none to draw: it could not be read, or the lead is gone.
 */
export function LeadDrawer({
  detail,
  revealed,
  revealing,
  onReveal,
  onClose,
}: {
  readonly detail: LeadDetail | "unavailable" | "gone";
  /** The whole address, once it has been revealed on this visit. */
  readonly revealed: string | null;
  readonly revealing: boolean;
  readonly onReveal: () => void;
  readonly onClose: () => void;
}) {
  const record = typeof detail === "string" ? null : detail;
  const masked = revealed === null;
  return (
    <BaseDialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Viewport className="fixed inset-0 z-dialog flex justify-end p-3 max-sm:p-0">
          <BaseDialog.Popup
            className={
              "blueprint flex w-[480px] max-w-full flex-col bg-surface-3 shadow-3 outline-none sm:w-[480px] " +
              "max-sm:w-full max-sm:border-0 max-sm:bg-surface-0 max-sm:shadow-none " +
              "transition-transform duration-(--duration-slow) ease-out-expo data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full"
            }
          >
            <span className="max-sm:hidden">
              <Corners />
            </span>
            {/* One header, two geometries: the desktop board's title block (title, a meta cell and
                the Close behind hairlines), and the phone board's 56px bar with nothing ruled. */}
            <div className="border-line flex items-stretch border-b max-sm:h-14 max-sm:items-center max-sm:gap-3 max-sm:pl-4 max-sm:pr-2">
              <h2 className="legend text-ink-1 flex-1 px-5 py-3 leading-6 max-sm:p-0">
                <BaseDialog.Title render={<span />}>{r.title}</BaseDialog.Title>
              </h2>
              {record ? <span className="legend border-line max-sm:legend-sm whitespace-nowrap border-l px-5 py-3 leading-6 max-sm:border-l-0 max-sm:p-0">{r.firstSeen(formatDate(record.firstSeen))}</span> : null}
              <span className="border-line flex items-center border-l px-3 py-1.5 max-sm:border-l-0 max-sm:p-0">
                <BaseDialog.Close render={<IconButton className="max-sm:size-11" label={messages.common.close} icon={<DismissRegular className="size-5" aria-hidden="true" />} size="sm" />} />
              </span>
            </div>
            {/* A stop of its own for a keyboard, as DataTable's scroller is. Until the address is
                revealed the Reveal button is in here and focus can reach it; afterwards nothing in
                it takes focus, and a record taller than the window could not be scrolled by keys. */}
            <div role="region" aria-label={r.details} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto">
              {record === null ? (
                <p role={detail === "unavailable" ? "alert" : "status"} className="px-5 py-4 text-sm max-sm:px-4">
                  {detail === "unavailable" ? r.unavailable : r.gone}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-5 py-3.5 max-sm:px-4">
                    <span className="min-w-0 grow text-lg font-medium [overflow-wrap:anywhere]">{revealed ?? record.email}</span>
                    {masked ? (
                      <Button variant="ghost" size="sm" className="max-sm:h-11" aria-label={m.table.revealLabel(record.email)} loading={revealing} onClick={onReveal}>
                        {m.table.reveal}
                      </Button>
                    ) : null}
                  </div>
                  {masked ? null : (
                    <p role="status" className="text-ink-2 text-label -mt-1.5 px-5 pb-3.5 max-sm:px-4">
                      {r.revealed}
                    </p>
                  )}
                  <Record detail={record} />
                </>
              )}
            </div>
            <p className="seam text-ink-3 px-5 py-3.5 text-sm leading-5 max-sm:px-4">{r.retention}</p>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
