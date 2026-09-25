"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";

// A date field whose calendar belongs to this site.
//
// The native one does not: Chrome's popup is outside the document, takes no CSS, and draws itself
// at its own size in its own greys — differently again on Firefox, on Windows and on a phone. It
// was the last control on the page the design system did not own, and the only one whose tap
// targets no phone standard would pass.
//
// The INPUT stays `type="date"`. Typing was never the broken part, and keeping it means the field
// still validates, still carries `min`, and still takes `.fill("2026-10-16")` from a test the way
// every other date field in the codebase does. Only the popup is replaced.

const c = messages.common.calendar;
/** Sunday first, and in that order: the grid is built from `getDay()`, which counts from Sunday. */
const WEEKDAYS = [c.weekdays.sun, c.weekdays.mon, c.weekdays.tue, c.weekdays.wed, c.weekdays.thu, c.weekdays.fri, c.weekdays.sat] as const;

const CELL =
  "relative flex h-9 w-9 cursor-pointer select-none items-center justify-center border border-transparent font-data text-sm leading-none text-ink-1 hover:border-line disabled:cursor-not-allowed disabled:text-ink-1/25 disabled:hover:border-transparent max-sm:h-11 max-sm:w-11";
const NAV =
  "press inline-flex h-8 w-8 cursor-pointer items-center justify-center border border-line text-ink-1 hover:bg-ink-1/7 disabled:cursor-not-allowed disabled:opacity-40 max-sm:h-11 max-sm:w-11";

/**
 * ISO for a local date, built field by field.
 *
 * `toISOString` would be UTC, which lands a day early everywhere east of Greenwich — for an IST
 * reader that is every date they pick after 05:30. The only safe conversion is the arithmetic one.
 */
function iso(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

/** A local Date from `yyyy-mm-dd`, or null. Parsed by hand for the same reason `iso` is built by hand. */
function fromIso(text: string): Date | null {
  const [y, m, d] = text.split("-").map(Number);
  if (!y || !m || !d) return null;
  const at = new Date(y, m - 1, d);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** What a cell is called when read aloud: the whole date, never the bare number. */
function fullDate(at: Date): string {
  const weekday = at.toLocaleDateString("en-IN", { weekday: "short" });
  const month = at.toLocaleDateString("en-IN", { month: "short" });
  return `${weekday}, ${at.getDate()} ${month} ${at.getFullYear()}`;
}

function monthName(at: Date): string {
  return `${at.toLocaleDateString("en-IN", { month: "long" })} ${at.getFullYear()}`;
}

/** The 42 cells of a six-week grid, Sunday first, so the month never reflows as you page through it. */
function gridOf(month: Date): readonly Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const at = new Date(start);
    at.setDate(start.getDate() + i);
    return at;
  });
}

function addDays(at: Date, days: number): Date {
  const next = new Date(at);
  next.setDate(at.getDate() + days);
  return next;
}

export function DateField({
  id,
  label,
  value,
  min,
  max,
  onChange,
  todayIso,
  invalid = false,
  describedBy,
  labelClassName,
  name,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly min?: string;
  readonly max?: string;
  readonly onChange: (iso: string) => void;
  /** Today as the site reckons it (IST), passed in rather than read from the device clock. */
  readonly todayIso?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly labelClassName?: string;
  readonly name?: string;
}) {
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const chosen = fromIso(value);
  // Where the keyboard is, which is not where the value is: a reader arrows around before choosing.
  const [cursor, setCursor] = useState<Date>(() => chosen ?? fromIso(todayIso ?? "") ?? new Date());
  const [month, setMonth] = useState<Date>(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const toggle = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  /**
   * Opening lands on the chosen day, or on today when nothing is chosen yet.
   *
   * Set here and not in an effect: an effect that writes state renders the popover once at the old
   * month and again at the right one, and the second render is what a reader sees move.
   */
  function openCalendar(): void {
    const at = chosen ?? fromIso(todayIso ?? "") ?? new Date();
    setCursor(at);
    setMonth(new Date(at.getFullYear(), at.getMonth(), 1));
    setOpen(true);
  }

  // Focus only — the popover has to exist before it can take it.
  useEffect(() => {
    if (open) popover.current?.focus();
  }, [open]);

  // A click anywhere else closes it, the way every menu on the site does.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popover.current?.contains(target) && !toggle.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function close(): void {
    setOpen(false);
    // Focus goes back to the control that opened it; leaving it in the body strands a keyboard reader.
    toggle.current?.focus();
  }

  function blocked(at: Date): boolean {
    const text = iso(at);
    return (min !== undefined && min !== "" && text < min) || (max !== undefined && max !== "" && text > max);
  }

  function pick(at: Date): void {
    if (blocked(at)) return;
    onChange(iso(at));
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in step) {
      event.preventDefault();
      // Crossing a month edge pages the grid rather than stopping at it: a calendar that refuses to
      // walk into November is a calendar that cannot reach most of the dates it is offering.
      const next = addDays(cursor, step[event.key] ?? 0);
      setCursor(next);
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(cursor);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const next = new Date(month.getFullYear(), month.getMonth() + (event.key === "PageUp" ? -1 : 1), 1);
      setMonth(next);
      setCursor(next);
    }
  }

  const days = gridOf(month);
  const today = todayIso ?? "";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative">
        {/* The INPUT carries the well, rather than a wrapper around it.

            A wrapper's own hairline leaves the field 38px of content box, and a field two pixels
            short of the drawn 40 is a tap-target failure — fields are replaced elements, take no
            pseudo-element, and so cannot be grown by the coarse-pointer overlay every button here
            gets for free. tests/e2e/tap-targets.spec.ts says exactly that, and caught this. */}
        <input
          id={id}
          name={name}
          type="date"
          value={value}
          min={min}
          max={max}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className="well h-10 w-full pl-2.5 pr-10 [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <button
          ref={toggle}
          type="button"
          aria-label={c.open}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          onClick={() => (open ? close() : openCalendar())}
          className="press absolute inset-y-px right-px inline-flex w-9 cursor-pointer items-center justify-center text-ink-1/70 hover:text-ink-1"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.25">
            <rect x="2" y="3.5" width="12" height="11" />
            <path d="M2 6.5h12M5.5 2v3M10.5 2v3" strokeLinecap="square" />
          </svg>
        </button>

        {open ? (
          <div
            ref={popover}
            id={dialogId}
            role="dialog"
            aria-modal="false"
            aria-label={c.open}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="popup-motion absolute left-0 top-full z-popover mt-1 w-max border border-line bg-surface-2 p-3 shadow-2 outline-none"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <button type="button" aria-label={c.previousMonth} className={NAV} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 3L5 8l5 5" strokeLinecap="square" />
                </svg>
              </button>
              <span className="font-display text-label font-semibold uppercase tracking-caps">{monthName(month)}</span>
              <button type="button" aria-label={c.nextMonth} className={NAV} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 3l5 5-5 5" strokeLinecap="square" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday} className="flex h-6 items-center justify-center text-2xs uppercase tracking-caps text-ink-1/60">
                  {weekday}
                </span>
              ))}
              {days.map((at) => {
                const text = iso(at);
                const outside = at.getMonth() !== month.getMonth();
                const isChosen = text === value;
                const isCursor = text === iso(cursor);
                const isToday = text === today;
                return (
                  <button
                    key={text}
                    type="button"
                    tabIndex={-1}
                    disabled={blocked(at)}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={isChosen}
                    aria-label={c.dayLabel(fullDate(at))}
                    onClick={() => pick(at)}
                    className={cn(
                      CELL,
                      // A day outside the drawn month is still a real day and still pickable; it is
                      // only quieter, so the month it belongs to is the one that reads.
                      outside && "text-ink-1/40",
                      isChosen && "border-accent bg-accent-soft text-accent-soft-ink",
                      !isChosen && isCursor && "border-line-strong",
                      !isChosen && isToday && "underline underline-offset-4",
                    )}
                  >
                    {at.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
