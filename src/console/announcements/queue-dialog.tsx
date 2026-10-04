"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { daysFor, finishDate, type Ahead } from "@/console/announcements/estimate";
import type { LetterList } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate } from "@/utils/datetime";

const m = consoleMessages.announcements;
const q = m.queueDialog;

/**
 * "Queue this letter?" (ConsoleAnnouncements.dc.html:276-300). A plain confirm, as drawn: no reason
 * and no key tap. It names what is about to be fixed — the list, the subject, how many people — and
 * how long it takes INCLUDING the letter ahead, because one letter drains at a time and an estimate
 * that ignored the queue would be wrong by exactly that letter.
 *
 * `people` is the list's count as the page was drawn. Queue fixes the real number a moment later,
 * and the toast and the detail page then carry that one.
 */
export function QueueDialog({
  open,
  onOpenChange,
  list,
  subject,
  people,
  ahead,
  now,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly list: LetterList;
  readonly subject: string;
  readonly people: number;
  readonly ahead: Ahead | null;
  readonly now: string;
  readonly onConfirm: () => Promise<void>;
}) {
  const own = daysFor(people);
  const finish = formatDate(finishDate(new Date(now), own + (ahead?.days ?? 0)));
  const items: readonly KeyValueItem[] = [
    { label: q.list, value: m.lists[list] },
    { label: q.subject, value: subject },
    { label: q.people, value: formatCount(people), numeric: true },
    ...(ahead ? [{ label: q.behind, value: ahead.more > 0 ? q.behindMany(ahead.subject, ahead.more, ahead.days) : q.behindOne(ahead.subject, ahead.days) }] : []),
    { label: q.takes, value: ahead ? q.takesBehind(own) : q.takesNow(own) },
    { label: q.finishes, value: q.around(finish) },
  ];
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={q.title}
      before={<KeyValueList items={items} />}
      description={q.detail}
      confirmLabel={q.confirm}
      tone="primary"
      onConfirm={onConfirm}
    />
  );
}
