"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { LEAD_NOTE_MAX, LEAD_TAG } from "@/console/leads/filters";
import type { LeadNote } from "@/console/leads/leads";
import { RecordSection } from "@/console/leads/record-section";
import { consoleMessages } from "@/console/messages";
import { formatDateTime } from "@/utils/datetime";

const m = consoleMessages.leads;
const r = m.record;

// What a console member writes about a lead: its tags and its notes (ConsoleLeads.dc.html, part
// two). Neither needs a key; the database records each act.
//
// ON A PHONE BOTH ARE READ AND NEITHER IS CHANGED, as the phone board draws them: every control
// here is `display: none` below `sm`, which takes it out of the tab order and the accessibility
// tree together, and the record's closing line says where to go instead.

const TAG = "bg-surface-1 text-2xs tracking-head text-ink-2 inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] leading-normal";

/**
 * A lead's tags, each with its own remove control, and the box that adds one.
 *
 * A tag is refused HERE when it is not one, in the form's own words and before any request, by the
 * same rule the database holds it to. `onAdd` and `onRemove` answer whether it was done: the draft
 * is kept when it was not.
 */
export function TagsSection({
  tags,
  suggestions,
  onAdd,
  onRemove,
}: {
  readonly tags: readonly string[];
  /** Every tag in use, offered as the box is typed in. */
  readonly suggestions: readonly string[];
  readonly onAdd: (tag: string) => Promise<boolean>;
  readonly onRemove: (tag: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const tag = draft.trim().toLowerCase();
    if (tag === "") return;
    if (!LEAD_TAG.test(tag)) {
      setRefused(true);
      return;
    }
    setBusy("+");
    const done = await onAdd(tag);
    setBusy(null);
    if (done) setDraft("");
  };

  const remove = async (tag: string) => {
    setBusy(tag);
    await onRemove(tag);
    setBusy(null);
  };

  return (
    <RecordSection title={r.tags}>
      {tags.length === 0 ? (
        <p className="text-ink-3 text-label">{r.noTags}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag} className={TAG}>
              {tag}
              <button type="button" aria-label={r.removeTag(tag)} disabled={busy !== null} onClick={() => void remove(tag)} className="press text-ink-3 hover:text-ink-1 -mr-1 inline-flex size-4 cursor-pointer items-center justify-center max-sm:hidden">
                <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-2.5">
                  <path d="M2 2l6 6M8 2 2 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void submit(event)} className="mt-3 max-sm:hidden" noValidate>
        <div className="flex gap-2">
          <input
            className="well placeholder:text-ink-3 h-10 w-[220px] max-w-full px-2.5"
            aria-label={r.addTag}
            aria-describedby={refused ? "ld-tag-refused ld-tag-hint" : "ld-tag-hint"}
            aria-invalid={refused || undefined}
            placeholder={r.addTag}
            list="ld-tag-suggestions"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setRefused(false);
            }}
          />
          <datalist id="ld-tag-suggestions">
            {suggestions
              .filter((tag) => !tags.includes(tag))
              .map((tag) => (
                <option key={tag} value={tag} />
              ))}
          </datalist>
          <Button type="submit" loading={busy === "+"}>
            {r.add}
          </Button>
        </div>
        {refused ? (
          <p id="ld-tag-refused" role="alert" className="text-label mt-1.5">
            {m.errors.notTag}
          </p>
        ) : null}
        <p id="ld-tag-hint" className="text-ink-3 text-label mt-1.5">
          {r.tagHint}
        </p>
      </form>
    </RecordSection>
  );
}

/**
 * A lead's notes, newest first, and the box that adds one.
 *
 * WHAT IS SHOWN IS WHAT WAS STORED. The database removes addresses, PNR-like numbers and IPs from
 * a note before it keeps it, so after adding one the list is redrawn from the server's answer and
 * never from what was typed. A note cannot be changed or removed afterwards; there is no control
 * that would.
 */
export function NotesSection({ notes, onAdd }: { readonly notes: readonly LeadNote[]; readonly onAdd: (body: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (body === "") {
      setRefused(true);
      return;
    }
    setBusy(true);
    const done = await onAdd(body);
    setBusy(false);
    if (done) setDraft("");
  };

  return (
    <RecordSection title={r.notes}>
      {notes.length === 0 ? (
        <p className="text-ink-3 text-label">{r.noNotes}</p>
      ) : (
        <ol aria-label={r.notes} className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-0.5">
              <span className="legend-sm tnum">{r.noteBy(note.author, formatDateTime(note.at))}</span>
              <span className="text-sm leading-5 [overflow-wrap:anywhere]">{note.body}</span>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={(event) => void submit(event)} className="mt-3.5 max-sm:hidden" noValidate>
        <label htmlFor="ld-note" className="legend text-accent-text mb-1.5 block">
          {r.addNote}
        </label>
        <textarea
          id="ld-note"
          className="well w-full resize-none px-2.5 py-1.5"
          rows={3}
          maxLength={LEAD_NOTE_MAX}
          aria-describedby={refused ? "ld-note-refused ld-note-hint" : "ld-note-hint"}
          aria-invalid={refused || undefined}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setRefused(false);
          }}
        />
        {refused ? (
          <p id="ld-note-refused" role="alert" className="text-label mt-1.5">
            {m.errors.emptyNote}
          </p>
        ) : null}
        <p id="ld-note-hint" className="text-ink-3 text-label mt-1.5">
          {r.noteHint}
        </p>
        <div className="mt-2.5">
          <Button type="submit" loading={busy}>
            {r.addNoteButton}
          </Button>
        </div>
      </form>
    </RecordSection>
  );
}
