import Link from "next/link";
import { Lamp } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import type { LetterRow, LetterState } from "@/console/announcements/letters";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate } from "@/utils/datetime";

const m = consoleMessages.announcements;

/** The sheet's five lamps: Draft hollow, Queued light, Sending half, Stopped ringed, Done lit. */
export function LetterLamp({ state }: { readonly state: LetterState }) {
  if (state === "done") return <Lamp lit />;
  if (state === "queued") return <Lamp busy />;
  if (state === "sending") return <Lamp variant="half" />;
  if (state === "stopped") return <Lamp variant="ringed" />;
  return <Lamp />;
}

export function progressOf(letter: LetterRow): string {
  if (letter.state === "draft") return m.letters.notQueued;
  return m.letters.line(formatCount(letter.sent), formatCount(letter.skipped), formatCount(letter.unknown), formatCount(letter.total));
}

/** A draft has no saved-again date in the store, so "Saved" is the day it was first saved. */
export function whenOf(letter: LetterRow): string {
  if (letter.state === "done" && letter.finishedAt) return m.letters.finished(formatDate(letter.finishedAt));
  if (letter.state === "stopped" && letter.stoppedAt) return m.letters.stopped(formatDate(letter.stoppedAt));
  if (letter.queuedAt) return m.letters.queued(formatDate(letter.queuedAt));
  return m.letters.saved(formatDate(letter.createdAt));
}

const hrefOf = (letter: LetterRow) => consoleHref(`/announcements/${letter.id}`);

function State({ letter }: { readonly letter: LetterRow }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LetterLamp state={letter.state} />
      {m.states[letter.state]}
    </span>
  );
}

/**
 * ConsoleAnnouncements.dc.html's Letters plate, and ConsoleAnnouncementsPhone.dc.html's. Drawn
 * twice — a table from `sm` up, cards below it — because the card is not the table's stacked form:
 * its state sits top right, over the subject. Each is `display: none` at the other width, so a
 * reader meets one list, never both.
 *
 * `null` is a list that could not be read. It is never drawn as "no letters".
 */
export function LettersPlate({ letters }: { readonly letters: readonly LetterRow[] | null }) {
  return (
    <Plate as="section" title={m.letters.title} titleId="an-letters" headingLevel={2} padding="none" meta={letters === null ? [] : [m.letters.count(letters.length)]}>
      {letters === null ? (
        <p role="status" className="px-5 py-4 text-sm">
          {m.letters.unavailable}
        </p>
      ) : letters.length === 0 ? (
        <p className="px-5 py-4 text-sm">{m.letters.none}</p>
      ) : (
        <>
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{m.letters.caption}</caption>
              <thead>
                <tr className="border-line border-b">
                  {[m.letters.subject, m.letters.list, m.letters.state, m.letters.progress, m.letters.when].map((h) => (
                    <th key={h} scope="col" className="legend whitespace-nowrap px-5 py-2 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {letters.map((letter) => (
                  <tr key={letter.id} className="border-line border-t first:border-t-0">
                    <td className="px-5 py-2.5 font-medium">
                      <Link href={hrefOf(letter)}>{letter.subject}</Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5">{m.lists[letter.list]}</td>
                    <td className="whitespace-nowrap px-5 py-2.5">
                      <State letter={letter} />
                    </td>
                    <td className="tnum whitespace-nowrap px-5 py-2.5">{progressOf(letter)}</td>
                    <td className="tnum whitespace-nowrap px-5 py-2.5">{whenOf(letter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="sm:hidden">
            {letters.map((letter) => (
              <li key={letter.id} className="border-line border-t first:border-t-0">
                <Link href={hrefOf(letter)} aria-label={m.letters.open(letter.subject)} className="text-ink-1 flex flex-col gap-2 px-4 py-3.5 no-underline">
                  <span className="flex items-center gap-2.5">
                    <span className="legend-sm tnum grow">{whenOf(letter)}</span>
                    <span className="text-label">
                      <State letter={letter} />
                    </span>
                  </span>
                  <span className="text-body font-medium">{letter.subject}</span>
                  <span className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
                    <span className="legend-sm">{m.letters.list}</span>
                    <span className="text-sm">{m.lists[letter.list]}</span>
                    <span className="legend-sm">{m.letters.progress}</span>
                    <span className="tnum text-sm">{progressOf(letter)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-ink-2 border-line border-t px-5 py-3 text-xs">{m.letters.footer}</p>
    </Plate>
  );
}
