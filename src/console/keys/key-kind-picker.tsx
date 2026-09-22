"use client";

import { useRef } from "react";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";
import { CONSOLE_KEY_KINDS, type ConsoleKeyKind } from "./kind";

const k = consoleMessages.keys;

/**
 * Which kind of key the member is about to add, on both add-key steps: setup's two
 * (src/app/console/setup/setup-flow.tsx) and My keys' dialog (@/console/account/add-key-dialog).
 *
 * Neither sheet draws this control -- both draw one Add key button and nothing else -- so it is
 * authored, and built from the one radiogroup this console already has rather than a second set of
 * arrow-key rules: @/console/team/role-picker's own shape, down to `<button type="button"
 * role="radio">` over the sheets' `<div role="radio">` (a div cannot be operated from the keyboard),
 * the roving tabindex, and a label over a description. It is not RolePicker itself because that one
 * renders roles, from the team copy, for a set this page has no business in.
 *
 * Nothing is pre-selected, on purpose. The defect being fixed is the browser having chosen for the
 * member; a default here would only move the choosing to the console, and whichever of the two it
 * defaulted to would re-create the same wall for the members who wanted the other. Same reading
 * change-role-dialog.tsx settled for its own undrawn picker ("the console has no business guessing
 * which way an Owner meant to move someone"). The caller keeps its submit disabled until `value`
 * stops being null.
 *
 * `disabled` is the running ceremony: once the browser's own sheet is open, changing the answer
 * behind it would describe a prompt that is no longer the one on screen.
 */
export function KeyKindPicker({
  value,
  labelId,
  disabled,
  onChange,
}: {
  readonly value: ConsoleKeyKind | null;
  readonly labelId: string;
  readonly disabled: boolean;
  readonly onChange: (kind: ConsoleKeyKind) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = value === null ? -1 : CONSOLE_KEY_KINDS.indexOf(value);

  function move(delta: number): void {
    const next = value === null ? CONSOLE_KEY_KINDS[delta > 0 ? 0 : CONSOLE_KEY_KINDS.length - 1] : CONSOLE_KEY_KINDS[(checkedIndex + delta + CONSOLE_KEY_KINDS.length) % CONSOLE_KEY_KINDS.length];
    if (!next) return;
    onChange(next);
    buttons.current[CONSOLE_KEY_KINDS.indexOf(next)]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col">
      {CONSOLE_KEY_KINDS.map((kind, index) => (
        <button
          key={kind}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === kind}
          disabled={disabled}
          tabIndex={checkedIndex === -1 ? (index === 0 ? 0 : -1) : value === kind ? 0 : -1}
          onClick={() => onChange(kind)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
          }}
          className="press flex cursor-pointer items-start gap-2.5 border-b border-line px-1 py-2.5 text-left last:border-b-0 hover:bg-ink-1/5 disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span
            aria-hidden="true"
            className={cn("mt-1 size-3.5 shrink-0 border", value === kind ? "border-accent-strong bg-accent-strong" : "border-line-strong bg-surface-1")}
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-5">{k.kind[kind].label}</span>
            <span className="text-label leading-5 text-ink-3">{k.kind[kind].note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
