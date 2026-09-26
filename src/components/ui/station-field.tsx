"use client";

import { useEffect, useId, useRef, useState } from "react";
import { messages } from "@/messages";
import type { Station } from "@/services/station-source";
import { cn } from "@/utils/cn";

// A station field that takes a NAME as well as a code.
//
// **The code still works, and that is the requirement.** The field has always taken "SBC", the
// form validates codes, and every reader who has used it before knows one. So this is an
// assistance layered over the same input, never a replacement for it: the value is still the code,
// typing is never blocked, and nothing here can stop a search that would have worked.
//
// The provider's search matches names only — "SBC" returns nothing there — so the seam behind this
// merges an exact code lookup in. That is why typing a code still finds its station.
//
// Every failure is silence. An autocomplete that interrupts someone mid-word has made typing worse
// than the plain box it replaced.

const m = messages.booking;

/** Long enough that a pause reads as "done typing", short enough not to feel laggy. */
const DEBOUNCE_MS = 250;
/** The seam refuses anything shorter, and one letter would match half the country. */
const MIN_QUERY = 2;

export function StationField({
  id,
  label,
  value,
  onChange,
  labelClassName,
  invalid = false,
  describedBy,
  onBlur,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly labelClassName?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly onBlur?: () => void;
}) {
  const listId = useId();
  /**
   * The result WITH the query that produced it.
   *
   * Without the query attached, a list outlives the text it belongs to: type "bengaluru", then
   * "SBC", and until the second answer lands the field is offering stations that match neither what
   * is on screen nor what was asked. Comparing the two is what makes a stale list impossible rather
   * than merely brief.
   */
  const [result, setResult] = useState<{ readonly query: string; readonly stations: readonly Station[] }>({ query: "", stations: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // What the reader last typed, as opposed to what a click on an option set. Only typing searches:
  // picking a station must not immediately search for the code it just inserted.
  const [typed, setTyped] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = typed.trim();
    if (query.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/stations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
          const body = (await res.json()) as { stations?: readonly Station[] };
          setResult({ query, stations: Array.isArray(body.stations) ? body.stations : [] });
        } catch {
          // Silence. The field still works; the list simply has nothing to offer.
          setResult({ query, stations: [] });
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Keyed to what was TYPED, not to `value`. They differ exactly when it matters: picking a
    // station changes `value` to its code, and an effect watching that would search for the code it
    // had just inserted.
  }, [typed]);

  // A click elsewhere closes the list, the way every menu on the site does.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function type(next: string): void {
    setTyped(next);
    setActive(-1);
    setOpen(true);
    onChange(next.toUpperCase());
  }

  function pick(station: Station): void {
    setTyped("");
    setResult({ query: "", stations: [] });
    setOpen(false);
    setActive(-1);
    onChange(station.code);
  }

  // Shown only while they still answer what is in the box. A list that outlives its query offers
  // stations matching neither the text on screen nor anything the reader asked for.
  const options = result.query !== "" && result.query === typed.trim() ? result.stations : [];

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((was) => (was + step + options.length) % options.length);
      return;
    }
    // Enter takes the HIGHLIGHTED option and nothing else. Taking the first one instead would
    // overwrite a perfectly good code the moment someone pressed Enter to submit.
    if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      const chosen = options[active];
      if (chosen) pick(chosen);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const showing = open && options.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div ref={box} className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          className="well h-10 w-full px-2.5 uppercase"
          placeholder={m.stationPlaceholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => type(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {showing ? (
          <ul id={listId} role="listbox" className="popup-motion absolute inset-x-0 top-full z-popover mt-1 border border-line bg-surface-2 py-1 shadow-2">
            {options.map((station, i) => (
              <li key={station.code} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                {/* `onMouseDown` and not `onClick`: a click blurs the field first, and a blur that
                    closes the list would take the option out from under the pointer. */}
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(station);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full cursor-pointer items-baseline gap-2.5 px-2.5 py-1.5 text-left max-sm:min-h-11", i === active && "bg-ink-1/7")}
                >
                  <span className="font-data text-xs text-ink-1">{station.code}</span>
                  <span className="truncate text-label text-ink-1/70">{station.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
