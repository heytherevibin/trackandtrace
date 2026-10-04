import type { ReactNode } from "react";
import { Lamp } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import type { ComposeLetter } from "@/console/announcements/compose-form";
import type { ListCounts } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDateTime } from "@/utils/datetime";

const m = consoleMessages.announcements;

function Row({ label, first = false, children }: { readonly label: string; readonly first?: boolean; readonly children: ReactNode }) {
  return (
    <div className={first ? "flex flex-col gap-0.5 px-4 py-3" : "border-line flex flex-col gap-0.5 border-t px-4 py-3"}>
      <span className="legend-sm">{label}</span>
      {children}
    </div>
  );
}

/**
 * ConsoleAnnouncementsPhone.dc.html, Compose. On a phone the console is for reading plus the urgent
 * action (Stop); writing, testing and queueing are for a larger screen, and this says so once, above
 * the draft. `letter` is null for New letter opened on a phone: there is nothing to read yet.
 */
export function ComposeReadonly({ letter, lists }: { readonly letter: ComposeLetter | null; readonly lists: ListCounts }) {
  if (!letter) return <p className="text-ink-3 text-label">{m.phone.newElsewhere}</p>;
  return (
    <>
      <p className="text-ink-3 text-label">{m.phone.note}</p>
      <Plate as="section" title={m.phone.title} titleId="an-draft" headingLevel={2} padding="none" meta={[m.phone.notQueued, m.compose.form]} stack>
        <Row label={m.compose.subject} first>
          <span className="text-body">{letter.subject}</span>
        </Row>
        <Row label={m.compose.list}>
          <span className="text-body">{m.phone.listLine(m.lists[letter.list], formatCount(lists[letter.list]))}</span>
        </Row>
        <Row label={m.compose.test.legend}>
          <span className="text-body inline-flex items-center gap-2">
            <Lamp lit={letter.testSentAt !== null} />
            {letter.testSentAt ? m.compose.test.sentOn(formatDateTime(letter.testSentAt), letter.testSentTo ?? "") : m.compose.test.notSent}
          </span>
        </Row>
        <Row label={m.phone.message}>
          <div className="well mt-1 whitespace-pre-wrap p-3 text-sm">{letter.body}</div>
          <p className="text-ink-3 text-label mt-1.5">{m.compose.bodyHint}</p>
        </Row>
        <p className="text-ink-2 border-line text-label border-t px-4 py-3">{letter.testSentAt ? m.phone.queueElsewhere : m.phone.queueOff}</p>
      </Plate>
    </>
  );
}
