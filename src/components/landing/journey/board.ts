import { animate, stagger, utils, type StaggerFunction } from "animejs";
import { messages } from "@/messages";
import { boardStatus, type BoardStatus } from "./board-status";
import { ease } from "./ease";
import { STATION_EVENT, type StationDetail } from "./journey-events";
import { STAGGER, T } from "./motion-tokens";
import { watchEntrances } from "./observers";
import type { JourneyContext, Teardown } from "./start-journey";

// The departure board while the journey runs (spec §3.A): the status column follows the page's station (station-progress.ts), and
// changed statuses flip in; the rows' names and statuses flip in once per load, the first time the reader reaches the
// board (a section entrance, the owner 2026-09-30).
// Flaps are characters on their own axis, turned by transform only, then written back as plain text.

const LABELS = messages.journey.board.statuses;

/** Writes text as one span per character, ready to turn; returns the spans. The whole word stays the
 * accessible name (an `aria-label`, cleared when the plain text comes back), and every span is `aria-hidden`,
 * so a link split mid-flip is still named for assistive tech, as Anime.js's own splitText names a kicker. */
function flapChars(el: HTMLElement, text: string): HTMLElement[] {
  el.setAttribute("aria-label", text);
  el.replaceChildren(
    ...[...text].map((c) => {
      const s = document.createElement("span");
      s.className = "flap-char";
      s.setAttribute("aria-hidden", "true");
      s.textContent = c === " " ? " " : c;
      return s;
    }),
  );
  return [...el.children] as HTMLElement[];
}

/** Writes plain text back and drops the stand-in `aria-label`, so the server's markup returns exactly. */
function unflap(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.removeAttribute("aria-label");
}

/** Turns the characters in; once they land, writes the plain text back, unless a newer status replaced them. */
function turn(chars: readonly HTMLElement[], el: HTMLElement, text: string, delay: StaggerFunction<number>) {
  return animate(chars, {
    rotateX: [-90, 0],
    duration: T.base,
    delay,
    ease: ease.expo(),
    onComplete: () =>
      window.setTimeout(() => {
        if (el.querySelector(".flap-char") && el.textContent?.replace(/ /g, " ") === text) unflap(el, text);
      }, 0),
  });
}

export function startBoard({ motion, played }: JourneyContext): Teardown {
  const board = document.querySelector<HTMLElement>("#departures .board");
  if (!board) return () => {};
  const rows = [...board.querySelectorAll<HTMLTableRowElement>("tbody tr[data-stop]")];
  const cells = rows.map((row) => row.querySelector<HTMLElement>("td.board-status"));
  const names = rows.map((row) => row.querySelector<HTMLElement>(".board-name a"));
  const values = new Map<HTMLElement, BoardStatus>();
  let station = 0;
  // Every build starts from station 0, and the strip's first announcement is where the board already stood
  // before it (a rebuild, a reload partway down): set, never flipped. Only a station reached after it flips.
  let arrived = false;

  const text = (status: BoardStatus) => (status ? LABELS[status] : "");
  const paint = (flip: boolean) => {
    rows.forEach((row, k) => {
      const cell = cells[k];
      if (!cell) return;
      const next = boardStatus(Number(row.dataset.stop), station);
      if (values.get(cell) === next) return;
      values.set(cell, next);
      row.classList.toggle("is-here", next === "here");
      row.classList.toggle("is-next", next === "next");
      if (flip && motion && next) turn(flapChars(cell, text(next)), cell, text(next), stagger(STAGGER.flap));
      else unflap(cell, text(next));
    });
  };
  const onStation = (event: Event) => {
    station = (event as CustomEvent<StationDetail>).detail.index;
    paint(arrived);
    arrived = true;
  };
  window.addEventListener(STATION_EVENT, onStation);
  paint(false);

  const settleWords = () => {
    names.forEach((a) => {
      if (a && a.querySelector(".flap-char")) unflap(a, a.dataset.label ?? a.textContent ?? "");
    });
    cells.forEach((cell) => {
      if (cell) unflap(cell, text(values.get(cell) ?? ""));
    });
  };
  const flipIn = motion
    ? watchEntrances([
        {
          trigger: board,
          at: 0.9,
          once: "board",
          arm: () => {
            settleWords();
            const nameChars = names.flatMap((a) => {
              if (!a) return [];
              a.dataset.label = a.textContent ?? "";
              return flapChars(a, a.dataset.label);
            });
            const statusChars = cells.flatMap((cell) => (cell && cell.textContent ? flapChars(cell, cell.textContent) : []));
            utils.set([...nameChars, ...statusChars], { rotateX: -90 });
          },
          play: () => {
            names.forEach((a, k) => {
              if (!a) return;
              const chars = [...a.querySelectorAll<HTMLElement>(".flap-char")];
              if (chars.length) turn(chars, a, a.dataset.label ?? "", stagger(8, { start: k * 30 }));
            });
            cells.forEach((cell, k) => {
              if (!cell) return;
              const chars = [...cell.querySelectorAll<HTMLElement>(".flap-char")];
              if (chars.length) turn(chars, cell, text(values.get(cell) ?? ""), stagger(STAGGER.flap, { start: 260 + k * 30 }));
            });
          },
          settle: settleWords,
        },
      ], played)
    : () => {};

  return () => {
    window.removeEventListener(STATION_EVENT, onStation);
    flipIn();
    utils.remove(board.querySelectorAll(".flap-char"));
    settleWords();
    names.forEach((a) => a?.removeAttribute("data-label"));
    rows.forEach((row) => row.classList.remove("is-here", "is-next"));
    cells.forEach((cell) => {
      if (cell) unflap(cell, "");
    });
  };
}
