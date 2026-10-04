"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceList, type Choice } from "@/components/ui/choice-list";
import { Lamp } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import { notify } from "@/components/ui/toast";
import { daysFor, type Ahead } from "@/console/announcements/estimate";
import type { LetterList, ListCounts } from "@/console/announcements/letters";
import { requestQueue, requestSave, requestTest } from "@/console/announcements/letters-client";
import { QueueDialog } from "@/console/announcements/queue-dialog";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { formatCount, formatDate, formatDateTime, formatTime } from "@/utils/datetime";

const m = consoleMessages.announcements;
const c = m.compose;

export interface ComposeLetter {
  readonly id: string;
  readonly list: LetterList;
  readonly subject: string;
  readonly body: string;
  readonly testSentAt: string | null;
  readonly testSentTo: string | null;
}

const SUBJECT_MAX = 200;
const BODY_MAX = 20000;

/**
 * ConsoleAnnouncements.dc.html, Compose (:107-160), from `sm` up. Below it the page draws
 * ComposeReadonly instead: the phone board has no form.
 *
 * Three actions, and each acts on the SAVED draft, never on what is typed: Save writes it; Send a
 * test mails the saved text and records the proof; Queue fixes the saved text for everyone on the
 * list. So while the form differs from what is saved, the last two are off and say why — a test of
 * words that are not the ones queued is no proof at all (the database clears the test on a change
 * for the same reason).
 *
 * `letter` is null for a letter never saved. `now` is the server's clock as an ISO string, so the
 * finish date is the same on the server's render and the browser's.
 */
export function ComposeForm({
  letter,
  lists,
  email,
  ahead,
  now,
}: {
  readonly letter: ComposeLetter | null;
  readonly lists: ListCounts;
  readonly email: string;
  readonly ahead: Ahead | null;
  readonly now: string;
}) {
  const router = useRouter();
  const [list, setList] = useState<LetterList>(letter?.list ?? "news");
  const [subject, setSubject] = useState(letter?.subject ?? "");
  const [body, setBody] = useState(letter?.body ?? "");
  const [problems, setProblems] = useState<{ readonly subject?: string; readonly body?: string }>({});
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [asking, setAsking] = useState(false);

  const untouched = letter === null && subject === "" && body === "";
  const dirty = letter === null || list !== letter.list || subject.trim() !== letter.subject || body !== letter.body;
  const tested = letter !== null && letter.testSentAt !== null;
  const people = lists[list];
  const takes = daysFor(people);

  // One reason at a time, the first that applies; when none does, the line says what Queue will do.
  const reason = untouched || (!dirty && !tested) ? c.notTested : dirty ? c.unsaved : people === 0 ? c.nobody : null;
  const line = reason ?? (ahead ? c.readyBehind(formatCount(people), takes) : c.ready(formatCount(people), takes));

  const choices: readonly Choice<LetterList>[] = [
    { value: "news", label: m.lists.news, description: c.confirmed(formatCount(lists.news)) },
    lists.availabilitySpent
      ? { value: "availability", label: m.lists.availability, description: lists.availabilitySpentAt ? c.spentOn(formatDate(lists.availabilitySpentAt)) : c.spentGoing, disabled: true }
      : { value: "availability", label: m.lists.availability, description: c.confirmed(formatCount(lists.availability)) },
  ];

  const sameDay = letter?.testSentAt ? formatDate(letter.testSentAt) === formatDate(now) : false;
  const testLine = !letter?.testSentAt
    ? c.test.notSent
    : sameDay
      ? c.test.sentAt(formatTime(letter.testSentAt), letter.testSentTo ?? email)
      : c.test.sentOn(formatDateTime(letter.testSentAt), letter.testSentTo ?? email);

  async function save(): Promise<void> {
    const trimmed = subject.trim();
    const found: { readonly subject?: string; readonly body?: string } = {
      ...(trimmed.length === 0 ? { subject: c.subjectNeeded } : trimmed.length > SUBJECT_MAX ? { subject: c.subjectTooLong } : {}),
      ...(body.trim().length === 0 ? { body: c.bodyNeeded } : body.length > BODY_MAX ? { body: c.bodyTooLong } : {}),
    };
    setProblems(found);
    if (found.subject || found.body) return;
    setBusy("save");
    const outcome = await requestSave(letter ? { id: letter.id, list, subject: trimmed, body } : { list, subject: trimmed, body });
    setBusy(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(c.saved);
    if (letter) router.refresh();
    else router.replace(consoleHref(`/announcements/${outcome.id}`));
  }

  async function test(): Promise<void> {
    if (!letter) return;
    setBusy("test");
    const outcome = await requestTest(letter.id);
    setBusy(null);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(c.test.done);
    router.refresh();
  }

  async function queue(): Promise<void> {
    if (!letter) return;
    const outcome = await requestQueue(letter.id);
    setAsking(false);
    if (outcome.kind === "failed") {
      notify.error(outcome.message);
      return;
    }
    notify.success(c.queued);
    // The same address now draws the letter's detail: it is no longer a draft.
    router.refresh();
  }

  return (
    <Plate as="section" title={c.title} titleId="an-compose" headingLevel={2} padding="none" meta={[c.draft, c.form]}>
      <div className="flex max-w-[760px] flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="an-subject" className="legend-md text-accent-text">
            {c.subject}
          </label>
          <input
            id="an-subject"
            type="text"
            className="well h-10 w-full px-2.5"
            value={subject}
            maxLength={SUBJECT_MAX}
            aria-invalid={problems.subject ? true : undefined}
            aria-describedby={problems.subject ? "an-subject-problem" : undefined}
            onChange={(event) => setSubject(event.target.value)}
          />
          {problems.subject ? (
            <p id="an-subject-problem" role="alert" className="text-label text-ink-alert font-medium">
              {problems.subject}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="an-list" className="legend-md text-accent-text">
            {c.list}
          </span>
          <ChoiceList value={list} choices={choices} labelId="an-list" onChange={setList} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="an-body" className="legend-md text-accent-text">
            {c.body}
          </label>
          <textarea
            id="an-body"
            rows={10}
            className="well w-full resize-none px-2.5 py-2"
            value={body}
            maxLength={BODY_MAX}
            aria-invalid={problems.body ? true : undefined}
            aria-describedby={problems.body ? "an-body-problem an-body-hint" : "an-body-hint"}
            onChange={(event) => setBody(event.target.value)}
          />
          {problems.body ? (
            <p id="an-body-problem" role="alert" className="text-label text-ink-alert font-medium">
              {problems.body}
            </p>
          ) : null}
          <p id="an-body-hint" className="text-label text-ink-3">
            {c.bodyHint}
          </p>
        </div>
      </div>

      <div className="border-line flex items-center gap-4 border-t px-5 py-4">
        <div className="flex grow flex-col gap-1">
          <span className="legend">{c.test.legend}</span>
          <span className="text-ink-2 text-sm">{c.test.detail(email)}</span>
          <span className="text-ink-2 text-label inline-flex items-center gap-2">
            <Lamp lit={Boolean(letter?.testSentAt)} />
            {testLine}
          </span>
        </div>
        <Button variant="secondary" disabled={letter === null || dirty || busy !== null} loading={busy === "test"} onClick={() => void test()}>
          {c.test.send}
        </Button>
      </div>

      <div className="border-line flex items-center justify-end gap-3 border-t px-5 py-3">
        <span id="an-queue-line" className="text-ink-2 text-label grow">
          {line}
        </span>
        <Button variant="secondary" disabled={busy !== null} loading={busy === "save"} onClick={() => void save()}>
          {c.save}
        </Button>
        <Button variant="primary" disabled={reason !== null || busy !== null} aria-describedby="an-queue-line" onClick={() => setAsking(true)}>
          {c.queue}
        </Button>
      </div>

      <QueueDialog open={asking} onOpenChange={setAsking} list={list} subject={subject.trim()} people={people} ahead={ahead} now={now} onConfirm={queue} />
    </Plate>
  );
}
