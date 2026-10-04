import type { ReactNode } from "react";
import { Plate } from "@/components/ui/plate";
import { daysFor, finishDate, percent, type Ahead } from "@/console/announcements/estimate";
import type { LetterDetail } from "@/console/announcements/letters";
import { StopButton } from "@/console/announcements/stop-button";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.announcements;
const d = m.detail;

interface Head {
  readonly legend: string;
  readonly headline: string;
  readonly detail: string;
}

/** The plate's first three lines, which are the whole difference between the four states. */
function headOf(letter: LetterDetail, ahead: Ahead | null, now: string): Head {
  if (letter.state === "stopped") {
    return {
      legend: d.stoppedLegend,
      headline: d.sentTo(formatCount(letter.sent)),
      detail: d.stoppedDetail(formatCount(letter.skipped), formatCount(letter.waiting), letter.stoppedAt ? formatDateTime(letter.stoppedAt) : "", letter.stoppedBy ?? d.formerMember),
    };
  }
  if (letter.state === "done") {
    return {
      legend: d.finishedLegend,
      headline: d.sentTo(formatCount(letter.sent)),
      detail:
        d.finishedDetail(letter.finishedAt ? formatDateTime(letter.finishedAt) : "", formatCount(letter.skipped)) +
        (letter.unknown > 0 ? d.finishedUnknown(formatCount(letter.unknown)) : "") +
        (letter.list === "availability" ? d.availabilitySpent : ""),
    };
  }
  const own = daysFor(letter.waiting);
  const finish = d.aroundDetail(formatDate(finishDate(new Date(now), own + (ahead?.days ?? 0))));
  if (letter.state === "queued") return { legend: d.estimated, headline: ahead ? d.startsAfter : d.startsNext, detail: finish };
  return { legend: d.estimated, headline: d.about(own), detail: finish };
}

function Figure({ label, value, hint, first = false }: { readonly label: string; readonly value: number; readonly hint: string; readonly first?: boolean }) {
  return (
    <div className={first ? "flex flex-col gap-1 p-5" : "border-line flex flex-col gap-1 border-t p-5 sm:border-l sm:border-t-0"}>
      <span className="legend">{label}</span>
      <span className="font-display tnum text-4xl">{formatCount(value)}</span>
      <span className="text-ink-3 text-label">{hint}</span>
    </div>
  );
}

/**
 * The Progress plate (ConsoleAnnouncements.dc.html:173-212): the headline, the meter, Sent, Skipped
 * and Unknown as three SEPARATE figures — a letter's unknowns are never folded into either of the
 * others, because unknown means we cannot say — and Stop while the letter is open.
 *
 * "Handled" is everything that is no longer waiting: sent, skipped and unknown together.
 */
export function ProgressPlate({ letter, ahead, now }: { readonly letter: LetterDetail; readonly ahead: Ahead | null; readonly now: string }) {
  const head = headOf(letter, ahead, now);
  const handled = letter.sent + letter.skipped + letter.unknown;
  const open = letter.state === "queued" || letter.state === "sending";
  return (
    <Plate as="section" title={d.progress} titleId="an-progress" headingLevel={2} padding="none" meta={[m.states[letter.state]]}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1">
          <span className="legend">{head.legend}</span>
          <p className="font-display text-3xl">{head.headline}</p>
          <p className="text-ink-2 mt-0.5 max-w-[72ch] text-sm">{head.detail}</p>
        </div>
        <div>
          <div role="progressbar" aria-label={d.meter} aria-valuemin={0} aria-valuemax={letter.total} aria-valuenow={handled} className="border-line-strong relative h-2 border">
            <i className="bg-accent absolute inset-y-0 left-0" style={{ width: `${percent(handled, letter.total)}%` }} />
          </div>
          <div className="mt-2 flex justify-between gap-3">
            <span className="legend tnum">{d.handled(formatCount(handled), formatCount(letter.total))}</span>
            <span className="legend tnum">{letter.state === "stopped" ? d.neverReached(formatCount(letter.waiting)) : d.waiting(formatCount(letter.waiting))}</span>
          </div>
        </div>
      </div>
      <div className="border-line grid border-t sm:grid-cols-3">
        <Figure first label={d.sent} value={letter.sent} hint={d.sentHint} />
        <Figure label={d.skipped} value={letter.skipped} hint={d.skippedHint} />
        <Figure label={d.unknown} value={letter.unknown} hint={d.unknownHint} />
      </div>
      {open ? (
        <div className="border-line flex items-center gap-4 border-t px-5 py-3 max-sm:flex-col max-sm:items-stretch">
          <span className="text-ink-2 text-label grow">{d.stopNote}</span>
          <StopButton id={letter.id} subject={letter.subject} sent={letter.sent} waiting={letter.waiting} />
        </div>
      ) : null}
      {letter.state === "stopped" ? <p className="text-ink-2 border-line text-label border-t px-5 py-3">{d.cantResume}</p> : null}
    </Plate>
  );
}

/** The Letter plate (ConsoleAnnouncements.dc.html:213-236): what was queued, by whom, and its words. */
export function LetterPlate({ letter }: { readonly letter: LetterDetail }) {
  const people = formatCount(letter.total);
  const list = m.lists[letter.list];
  const stamped = (at: string | null, name: string | null) => (at === null ? "" : name ? d.by(formatDateTime(at), name) : d.byNobody(formatDateTime(at)));
  const items: readonly { readonly label: string; readonly value: ReactNode }[] = [
    { label: d.subjectRow, value: letter.subject },
    { label: d.listRow, value: d.listWhenQueued(list, people) },
    { label: d.queuedRow, value: stamped(letter.queuedAt, letter.queuedBy) },
    { label: d.testRow, value: letter.testSentAt ? d.testTo(formatDateTime(letter.testSentAt), letter.testSentTo ?? "") : "" },
    ...(letter.state === "sending" ? [{ label: d.todayRow, value: d.today(formatCount(letter.sentToday)) }] : []),
    ...(letter.state === "stopped" ? [{ label: d.stoppedLegend, value: stamped(letter.stoppedAt, letter.stoppedBy ?? d.formerMember) }] : []),
    ...(letter.state === "done" && letter.finishedAt ? [{ label: d.finishedLegend, value: d.at(formatDateTime(letter.finishedAt)) }] : []),
    {
      label: d.messageRow,
      value: (
        <>
          <div className="well max-w-[640px] whitespace-pre-wrap px-3.5 py-3 text-sm">{letter.body}</div>
          <p className="text-ink-3 text-label mt-2">{d.messageHint}</p>
        </>
      ),
    },
  ];
  return (
    <Plate as="section" title={d.letter} titleId="an-letter" headingLevel={2} padding="none" meta={[d.listCell(list, people)]}>
      {/* The board's own grid (:216): a 180px label column, one hairline under each whole row, labels
          at the top of their row. Not KeyValueList: its label column is a third of the width and it
          centres a label against a tall value, which the Message row is. Below `sm` a row stacks. */}
      <dl className="px-5 pb-2 pt-1">
        {items.map((item) => (
          <div key={item.label} className="border-line grid gap-x-4 gap-y-1 border-t py-2.5 first:border-t-0 sm:grid-cols-[180px_minmax(0,1fr)]">
            <dt className="legend-sm sm:pt-1">{item.label}</dt>
            <dd className="text-body text-ink-1 min-w-0">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Plate>
  );
}
