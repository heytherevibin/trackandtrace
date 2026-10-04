import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LettersPlate, progressOf, whenOf } from "@/console/announcements/letters-plate";
import type { LetterRow } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

// ConsoleAnnouncements.dc.html, the List board: Subject, List, State, Progress, When. The four
// sample letters are the sheet's own, with its figures.
const m = consoleMessages.announcements;

const row = (over: Partial<LetterRow>): LetterRow => ({
  id: "a0000000-0000-4000-8000-000000000001", list: "news", subject: "S", state: "draft", total: 0,
  sent: 0, skipped: 0, unknown: 0, waiting: 0,
  createdAt: "2026-09-18T04:00:00+00:00", queuedAt: null, stoppedAt: null, finishedAt: null,
  ...over,
});
const DRAFT = row({ subject: "Trakline news: what's coming next" });
const SENDING = row({ id: "a0000000-0000-4000-8000-000000000002", subject: "Trakline news: a clearer chart view", state: "sending", total: 431, sent: 262, skipped: 4, waiting: 165, queuedAt: "2026-09-11T03:35:00+00:00" });
const STOPPED = row({ id: "a0000000-0000-4000-8000-000000000003", subject: "Trakline news: the new look", state: "stopped", total: 418, sent: 120, skipped: 3, waiting: 295, queuedAt: "2026-09-08T03:42:00+00:00", stoppedAt: "2026-09-10T05:10:00+00:00" });
const DONE = row({ id: "a0000000-0000-4000-8000-000000000004", list: "availability", subject: "Availability checks are open", state: "done", total: 217, sent: 213, skipped: 4, queuedAt: "2026-09-01T03:50:00+00:00", finishedAt: "2026-09-06T08:40:00+00:00" });

describe("progressOf and whenOf", () => {
  it("says a draft is not queued, and when it was saved", () => {
    expect(progressOf(DRAFT)).toBe("Not queued");
    expect(whenOf(DRAFT)).toMatch(/^Saved 18 Sep/);
  });

  it("gives sent, skipped and unknown as three counts of the total", () => {
    expect(progressOf(SENDING)).toBe("Sent 262 · Skipped 4 · Unknown 0 of 431");
    expect(whenOf(SENDING)).toMatch(/^Queued 11 Sep/);
  });

  it("dates a stopped letter by its stop and a done one by its finish", () => {
    expect(whenOf(STOPPED)).toMatch(/^Stopped 10 Sep/);
    expect(whenOf(DONE)).toMatch(/^Finished 0?6 Sep/);
  });
});

describe("LettersPlate", () => {
  it("draws one row per letter, each subject a link to that letter", () => {
    render(<LettersPlate letters={[DRAFT, SENDING, STOPPED, DONE]} />);
    const table = screen.getByRole("table", { name: m.letters.caption });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByRole("link", { name: SENDING.subject })).toHaveAttribute("href", `/announcements/${SENDING.id}`);
    expect(within(rows[1]!).getByText("Sending")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("4 letters")).toBeInTheDocument();
    expect(screen.getByText(m.letters.footer)).toBeInTheDocument();
  });

  it("draws the same letters as cards for a phone, each one a single link", () => {
    render(<LettersPlate letters={[SENDING]} />);
    expect(screen.getByRole("link", { name: m.letters.open(SENDING.subject) })).toHaveAttribute("href", `/announcements/${SENDING.id}`);
  });

  it("says so when there are no letters, and keeps the footer", () => {
    render(<LettersPlate letters={[]} />);
    expect(screen.getByText(m.letters.none)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(m.letters.footer)).toBeInTheDocument();
  });

  it("says the list could not be read, never that there are none", () => {
    render(<LettersPlate letters={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.letters.unavailable);
    expect(screen.queryByText(m.letters.none)).not.toBeInTheDocument();
  });
});
