"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { Plate } from "@/components/ui/plate";
import { notify } from "@/components/ui/toast";
import { requestLift, requestReveal } from "@/console/announcements/letters-client";
import { kindOf, reasonOf, sourceOf, type Suppression } from "@/console/announcements/suppressions";
import { consoleMessages } from "@/console/messages";
import { formatDate, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.announcements.suppressions;

/** A row as the page shows it now: its address is the revealed one once there is one. */
interface Shown extends Suppression {
  readonly shown: string;
  readonly hidden: boolean;
}

function Scope({ scope }: { readonly scope: Suppression["scope"] }) {
  return <Badge variant={scope === "all" ? "accent" : "neutral"}>{m.scopes[scope]}</Badge>;
}

/** What lifting this row restarts, in the sheet's words for its scope and cause. */
function liftDetail(row: Suppression): string {
  const date = formatDate(row.at);
  const kind = kindOf(row.reason);
  if (kind === "provider") return m.liftDialog.provider(date);
  return row.scope === "all" ? m.liftDialog.all(date, m.liftDialog.after[kind]) : m.liftDialog.list(date, m.liftDialog.after[kind]);
}

/**
 * ConsoleAnnouncements.dc.html's Suppressed addresses plate and both Lift confirms, and
 * ConsoleAnnouncementsPhone.dc.html's cards. Drawn twice, a table from `sm` up and cards below it,
 * each `display: none` at the other width, as the Letters plate is.
 *
 * AN ADDRESS IS MASKED UNTIL REVEALED, except a console member's, which arrives whole and marked
 * Operator. Reveal asks the server for one address; the database records that it did. What is
 * revealed is held in this component's state and nowhere else, so a reload masks it again — and a
 * second look is a second audit row, which is the point of the record.
 *
 * LIFT NEEDS THE ADDRESS. On a masked row it is drawn disabled, with the reason. The lift itself
 * sends the address this component is showing, and the database refuses one that is not the row's
 * own: the greyed-out button is the drawing of the rule, not the rule.
 *
 * On a phone there is no Lift at all (the README's B4 section): the console reads there, and stops.
 *
 * `null` is a list that could not be read. It is never drawn as "nobody is suppressed".
 */
export function SuppressionsPlate({ rows }: { readonly rows: readonly Suppression[] | null }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Readonly<Record<string, string>>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [lifting, setLifting] = useState<Shown | null>(null);

  const shown: readonly Shown[] = (rows ?? []).map((row) => ({ ...row, shown: revealed[row.id] ?? row.address, hidden: row.masked && revealed[row.id] === undefined }));

  async function reveal(row: Shown): Promise<void> {
    setRevealing(row.id);
    const outcome = await requestReveal(row.id);
    setRevealing(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    setRevealed((before) => ({ ...before, [row.id]: outcome.address }));
  }

  async function lift(): Promise<void> {
    if (!lifting) return;
    const outcome = await requestLift(lifting.id, lifting.shown);
    setLifting(null);
    if (outcome.kind === "done") notify.success(m.liftDialog.done);
    else notify.error(outcome.message);
    // After a failure too: a lift is refused when the row is already gone, and the list should show that.
    router.refresh();
  }

  const dialogItems: readonly KeyValueItem[] = lifting
    ? [
        { label: m.liftDialog.address, value: lifting.shown },
        { label: m.liftDialog.scope, value: m.scopes[lifting.scope] },
        ...(kindOf(lifting.reason) === "provider" ? [{ label: m.liftDialog.source, value: sourceOf(lifting.reason) }] : []),
      ]
    : [];

  return (
    <Plate as="section" title={m.title} titleId="an-suppressions" headingLevel={2} padding="none" meta={rows === null ? [] : [m.count(rows.length)]}>
      {rows === null ? (
        <p role="status" className="px-5 py-4 text-sm">
          {m.unavailable}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm">{m.none}</p>
      ) : (
        <>
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{m.caption}</caption>
              <thead>
                <tr className="border-line border-b">
                  {[m.address, m.scope, m.reason, m.when, m.source].map((h) => (
                    <th key={h} scope="col" className="legend whitespace-nowrap px-5 py-2 font-normal">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-2 text-right">
                    <span className="sr-only">{m.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} className="border-line border-t first:border-t-0">
                    <th scope="row" className="px-5 py-2.5 text-left font-normal">
                      <span className="inline-flex items-center gap-2.5">
                        <span>{row.shown}</span>
                        {row.operator ? <Badge variant="steel">{m.operator}</Badge> : null}
                      </span>
                    </th>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <Scope scope={row.scope} />
                    </td>
                    <td className="px-5 py-2.5">{reasonOf(row.reason)}</td>
                    <td className="tnum whitespace-nowrap px-5 py-2.5">{m.at(formatDateTime(row.at))}</td>
                    <td className="px-5 py-2.5">{sourceOf(row.reason)}</td>
                    <td className="whitespace-nowrap px-5 py-1 text-right">
                      {row.hidden ? (
                        <Button variant="ghost" size="sm" aria-label={m.revealLabel(row.shown)} loading={revealing === row.id} onClick={() => void reveal(row)}>
                          {m.reveal}
                        </Button>
                      ) : null}{" "}
                      {row.hidden ? (
                        <Button variant="ghost" size="sm" disabled title={m.liftFirst} aria-label={m.liftLabelMasked(row.shown)}>
                          {m.lift}
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" aria-label={m.liftLabel(row.shown)} onClick={() => setLifting(row)}>
                          {m.lift}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul aria-label={m.caption} className="sm:hidden">
            {shown.map((row) => (
              <li key={row.id} className="border-line flex flex-col gap-2 border-t px-4 py-3 first:border-t-0">
                <span className="flex min-h-11 items-center gap-2">
                  <span className="text-body min-w-0 grow font-medium [overflow-wrap:anywhere]">{row.shown}</span>
                  {row.operator ? <Badge variant="steel">{m.operator}</Badge> : null}
                  {row.hidden ? (
                    <Button variant="ghost" size="lg" aria-label={m.revealLabel(row.shown)} loading={revealing === row.id} onClick={() => void reveal(row)}>
                      {m.reveal}
                    </Button>
                  ) : null}
                </span>
                <span className="flex items-center gap-2.5">
                  <Scope scope={row.scope} />
                  <span className="text-sm">{reasonOf(row.reason)}</span>
                </span>
                <span className="legend-sm tnum">
                  {m.at(formatDateTime(row.at))} · {sourceOf(row.reason)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className="text-ink-2 border-line flex list-disc flex-col gap-1 border-t py-3 pl-8 pr-5 text-xs max-sm:hidden">
        {m.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <ul className="text-ink-2 border-line flex list-disc flex-col gap-1 border-t py-3 pl-8 pr-4 text-xs sm:hidden">
        {m.phoneNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      <ConfirmDialog
        open={lifting !== null}
        onOpenChange={(open) => {
          if (!open) setLifting(null);
        }}
        title={m.liftDialog.title}
        before={<KeyValueList items={dialogItems} />}
        description={lifting ? liftDetail(lifting) : ""}
        confirmLabel={m.liftDialog.confirm}
        tone="primary"
        onConfirm={lift}
      />
    </Plate>
  );
}
