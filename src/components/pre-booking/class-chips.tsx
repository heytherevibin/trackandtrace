"use client";

import { useId } from "react";
import { messages } from "@/messages";
import type { FormClass } from "@/types/booking";
import { cn } from "@/utils/cn";

// Classes are a multiple choice, so they are toggles and not a select: a select shows one answer
// and this question has several.
//
// What comes back is always the enum's order, never the order they were clicked. The first of them
// is the class the whole list leads with, so two readers who picked the same three must see the
// same column — and a set that reordered itself by click would make that column look arbitrary.

const DRAWN: readonly FormClass[] = ["SL", "3A", "2A", "1A", "CC", "EC", "2S"];
/** The order the lead is taken from; it mirrors `bookingClassSchema`, which the service reads. */
const ORDER: readonly FormClass[] = ["1A", "2A", "3A", "SL", "CC", "EC", "2S"];

const CHIP =
  "press relative inline-flex min-h-8 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border px-2.5 py-1 font-display text-label font-semibold leading-none";
const ON = "border-accent bg-accent-soft text-accent-soft-ink";
const OFF = "border-line bg-transparent text-ink-1 hover:bg-ink-1/7";

const m = messages.booking;

/** The chosen classes in the enum's order — the lead first. */
export function inOrder(chosen: readonly FormClass[]): readonly FormClass[] {
  return ORDER.filter((cls) => chosen.includes(cls));
}

export function ClassChips({
  value,
  onChange,
  labelledBy,
}: {
  readonly value: readonly FormClass[];
  readonly onChange: (next: readonly FormClass[]) => void;
  readonly labelledBy: string;
}) {
  const ids = useId();
  const ordered = inOrder(value);
  const lead = ordered[0];

  function toggle(cls: FormClass): void {
    const on = value.includes(cls);
    // No class is not a question anyone can answer, and quietly picking one back would spend a
    // request on a berth nobody asked about. So the last one does not turn off.
    if (on && ordered.length === 1) return;
    onChange(inOrder(on ? value.filter((c) => c !== cls) : [...value, cls]));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
        {DRAWN.map((cls) => (
          <button
            key={cls}
            type="button"
            aria-pressed={value.includes(cls)}
            aria-describedby={`${ids}-${cls}`}
            className={cn(CHIP, value.includes(cls) ? ON : OFF)}
            onClick={() => toggle(cls)}
          >
            {cls}
          </button>
        ))}
      </div>
      {/* The full names live outside the buttons on purpose: inside, they would join the accessible
          NAME ("SL Sleeper") instead of describing it, and a screen reader would announce the code
          twice over. */}
      <span hidden>
        {DRAWN.map((cls) => (
          <span key={cls} id={`${ids}-${cls}`}>
            {m.classNames[cls]}
          </span>
        ))}
      </span>
      {/* Which class the list leads with is invisible otherwise, and a column nobody chose reads as
          arbitrary. It is a fact about what will be asked, so it is said. */}
      {lead && ordered.length > 1 ? <span className="text-label text-ink-1/70">{m.list.leadsWith(lead)}</span> : null}
    </div>
  );
}
