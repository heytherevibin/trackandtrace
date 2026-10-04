"use client";

import { useRef } from "react";
import { cn } from "@/utils/cn";

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description: string;
  /** Drawn at 45%, `aria-disabled`, out of the tab order and skipped by the arrow keys. */
  readonly disabled?: boolean;
}

/**
 * The sheets' `.choice` rows: `role="radiogroup"` labelled by a legend, one `role="radio"` per
 * choice, each a name over a description (ConsoleTeam.dc.html:214-219,
 * ConsoleAnnouncements.dc.html's List picker).
 *
 * The sheets draw each choice as a `<div role="radio">`. A div cannot be operated from the keyboard
 * and is not a button to assistive technology's activation model, so these are
 * `<button type="button" role="radio">` — the accessible choice where the transcription would
 * otherwise conflict. The roving tabindex the sheets draw (0 on the checked choice, -1 on the rest)
 * is kept exactly, and arrow keys move the selection the way the radiogroup pattern requires.
 *
 * `value` may be null: a radiogroup with nothing checked still needs one tabbable choice, so the
 * tab stop sits on the first enabled one, and the first arrow key picks the end it points at.
 *
 * A disabled choice is `aria-disabled` rather than `disabled`, as the sheet draws it, so it stays
 * readable to a screen reader with its reason in the description.
 */
export function ChoiceList<T extends string>({
  value,
  choices,
  labelId,
  onChange,
}: {
  readonly value: T | null;
  readonly choices: readonly Choice<T>[];
  readonly labelId: string;
  readonly onChange: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = choices.filter((c) => !c.disabled);
  const checked = value === null ? -1 : enabled.findIndex((c) => c.value === value);
  const tabStop = checked === -1 ? enabled[0]?.value : value;

  function move(delta: number): void {
    const next = checked === -1 ? enabled[delta > 0 ? 0 : enabled.length - 1] : enabled[(checked + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    buttons.current[choices.indexOf(next)]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-col">
      {choices.map((choice, index) => (
        <button
          key={choice.value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          aria-disabled={choice.disabled ? true : undefined}
          tabIndex={!choice.disabled && choice.value === tabStop ? 0 : -1}
          onClick={() => {
            if (!choice.disabled) onChange(choice.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              move(-1);
            }
          }}
          className={cn(
            "press flex items-start gap-2.5 border-b border-line px-1 py-2.5 text-left last:border-b-0",
            choice.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-ink-1/5",
          )}
        >
          <span aria-hidden="true" className={cn("mt-1 size-3.5 shrink-0 border", value === choice.value ? "border-accent-strong bg-accent-strong" : "border-line-strong bg-surface-1")} />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium leading-5">{choice.label}</span>
            <span className="text-label leading-5 text-ink-3">{choice.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
