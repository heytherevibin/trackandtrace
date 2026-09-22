"use client";

import { useRef } from "react";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const f = consoleMessages.frame;

/**
 * The sheet's role picker: `role="radiogroup"` labelled by a legend, one `role="radio"` per choice,
 * each a name over a description (ConsoleTeam.dc.html:214-219).
 *
 * Built for the invite dialog in Task 4 and lifted out of it here, unchanged, because Task 5's
 * change-role picker is the same control with one choice left out (task-5-addendum.md §2: "Do not
 * author a second radiogroup; if Task 4's is not extractable, extract it"). Which choices to draw
 * is the caller's -- the invite offers all four, the change-role picker every role but the member's
 * own.
 *
 * The sheet draws each choice as a `<div role="radio" tabindex="-1">`. A div cannot be operated
 * from the keyboard and is not a button to assistive technology's activation model, so these are
 * `<button type="button" role="radio">` instead -- the accessible choice where the transcription
 * would otherwise conflict, and the line departed from is quoted above. The roving tabindex the
 * sheet draws (0 on the checked choice, -1 on the rest) is kept exactly, and arrow keys move the
 * selection the way the radiogroup pattern requires.
 *
 * `value` may be null, which the invite never passes and the change-role picker always starts on:
 * a radiogroup with nothing checked still needs one tabbable choice, so the tab stop sits on the
 * first, and the first arrow key in either direction picks the end it points at rather than
 * wrapping from an index that does not exist.
 *
 * The descriptions are imported, never restated: Task 3 authored them once at
 * consoleMessages.team.roleDescription precisely so every surface that offers a role could share
 * one copy (task-3-report.md, task-4-addendum.md §1).
 */
export function RolePicker({
  value,
  roles,
  labelId,
  onChange,
}: {
  readonly value: ConsoleRole | null;
  readonly roles: readonly ConsoleRole[];
  readonly labelId: string;
  readonly onChange: (role: ConsoleRole) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = value === null ? -1 : roles.indexOf(value);

  function move(delta: number): void {
    const next = value === null ? roles[delta > 0 ? 0 : roles.length - 1] : roles[(checkedIndex + delta + roles.length) % roles.length];
    if (!next) return;
    onChange(next);
    buttons.current[roles.indexOf(next)]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col">
      {roles.map((role, index) => (
        <button
          key={role}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === role}
          tabIndex={checkedIndex === -1 ? (index === 0 ? 0 : -1) : value === role ? 0 : -1}
          onClick={() => onChange(role)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
          }}
          className="press flex cursor-pointer items-start gap-2.5 border-b border-line px-1 py-2.5 text-left last:border-b-0 hover:bg-ink-1/5"
        >
          <span
            aria-hidden="true"
            className={cn("mt-1 size-3.5 shrink-0 border", value === role ? "border-accent-strong bg-accent-strong" : "border-line-strong bg-surface-1")}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-5">{f.roleLabel[role]}</span>
            <span className="text-label leading-5 text-ink-3">{consoleMessages.team.roleDescription[role]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
