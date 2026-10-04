import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LetterDetail } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

vi.mock("@/console/announcements/stop-button", () => ({ StopButton: ({ sent, waiting }: { sent: number; waiting: number }) => <button type="button">{`Stop ${sent}/${waiting}`}</button> }));

import { LetterPlate, ProgressPlate } from "@/console/announcements/detail-plates";

// ---------------------------------------------------------------------------
// ConsoleAnnouncements.dc.html: Sending, Stopped and Done, with the sheet's own
// figures. Queued has no board; it is built from the README's B4 note.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.detail;
const NOW = "2026-09-19T09:02:00+00:00";
const base: LetterDetail = {
  id: "a0000000-0000-4000-8000-000000000001", list: "news", subject: "Trakline news: a clearer chart view",
  body: "Hello,\n\nThe chart view is clearer now.\n\nThe Trakline team", state: "sending", total: 431,
  sent: 262, skipped: 4, unknown: 0, waiting: 165, sentToday: 31,
  createdAt: "2026-09-10T03:00:00+00:00", queuedAt: "2026-09-11T03:35:00+00:00", stoppedAt: null, finishedAt: null,
  testSentAt: "2026-09-11T03:28:00+00:00", testSentTo: "asha@example.com", queuedBy: "Asha Rao", stoppedBy: null,
};
const STOPPED: LetterDetail = { ...base, subject: "Trakline news: the new look", state: "stopped", total: 418, sent: 120, skipped: 3, waiting: 295, sentToday: 0, stoppedAt: "2026-09-10T05:10:00+00:00", stoppedBy: "Rohan Iyer" };
const DONE: LetterDetail = { ...base, list: "availability", subject: "Availability checks are open", state: "done", total: 217, sent: 213, skipped: 4, waiting: 0, sentToday: 0, finishedAt: "2026-09-06T08:40:00+00:00" };
const QUEUED: LetterDetail = { ...base, state: "queued", sent: 0, skipped: 0, waiting: 431, sentToday: 0 };

describe("ProgressPlate", () => {
  it("draws a sending letter: the estimate, the meter, three separate figures, and Stop", () => {
    render(<ProgressPlate letter={base} ahead={null} now={NOW} />);
    const plate = screen.getByRole("region", { name: m.progress });
    expect(within(plate).getByText(m.estimated)).toBeInTheDocument();
    expect(within(plate).getByText("About 4 days at 40 a day")).toBeInTheDocument();
    expect(within(plate).getByText(/^Around 23 Sep/)).toBeInTheDocument();
    const meter = within(plate).getByRole("progressbar", { name: m.meter });
    expect(meter).toHaveAttribute("aria-valuenow", "266");
    expect(meter).toHaveAttribute("aria-valuemax", "431");
    expect(within(plate).getByText("266 of 431 handled")).toBeInTheDocument();
    expect(within(plate).getByText("165 waiting")).toBeInTheDocument();
    expect(within(plate).getByText("262")).toBeInTheDocument();
    expect(within(plate).getByText(m.unknownHint)).toBeInTheDocument();
    expect(within(plate).getByRole("button", { name: "Stop 262/165" })).toBeInTheDocument();
    expect(within(plate).getByText(m.stopNote)).toBeInTheDocument();
  });

  it("draws a stopped letter: what went, what never will, who stopped it, and no action", () => {
    render(<ProgressPlate letter={STOPPED} ahead={null} now={NOW} />);
    expect(screen.getByText("Sent to 120 people")).toBeInTheDocument();
    expect(screen.getByText(/^3 were skipped, and 295 were never reached and won't be\. Stopped on 10 Sep.* IST by Rohan Iyer\.$/)).toBeInTheDocument();
    expect(screen.getByText("295 never reached")).toBeInTheDocument();
    expect(screen.getByText(m.cantResume)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws a done letter, and says the Availability list is spent", () => {
    render(<ProgressPlate letter={DONE} ahead={null} now={NOW} />);
    expect(screen.getByText("Sent to 213 people")).toBeInTheDocument();
    expect(screen.getByText(/^Finished on 0?6 Sep.* IST\. 4 were skipped\. The availability list is spent/)).toBeInTheDocument();
    expect(screen.getByText("217 of 217 handled")).toBeInTheDocument();
    expect(screen.queryByText(/may or may not have gone\./)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws a queued letter waiting behind another, and offers Stop", () => {
    render(<ProgressPlate letter={QUEUED} ahead={{ subject: "The letter ahead", more: 0, days: 4 }} now={NOW} />);
    expect(screen.getByText(m.startsAfter)).toBeInTheDocument();
    expect(screen.getByText(/^Around 0?4 Oct/)).toBeInTheDocument();
    expect(screen.getByText("0 of 431 handled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop 0/431" })).toBeInTheDocument();
  });

  it("names a former member when whoever stopped it has since been removed", () => {
    render(<ProgressPlate letter={{ ...STOPPED, stoppedBy: null }} ahead={null} now={NOW} />);
    expect(screen.getByText(/IST by a former member\.$/)).toBeInTheDocument();
  });
});

describe("LetterPlate", () => {
  it("draws the letter as it was queued, with today's count while it is sending", () => {
    render(<LetterPlate letter={base} />);
    const plate = screen.getByRole("region", { name: m.letter });
    expect(within(plate).getByText("News · 431 people when it was queued")).toBeInTheDocument();
    expect(within(plate).getByText(/^11 Sep.* IST by Asha Rao$/)).toBeInTheDocument();
    expect(within(plate).getByText(/^11 Sep.* IST to asha@example\.com$/)).toBeInTheDocument();
    expect(within(plate).getByText(m.today("31"))).toBeInTheDocument();
    expect(within(plate).getByText(/The chart view is clearer now\./)).toBeInTheDocument();
    expect(within(plate).getByText(m.messageHint)).toBeInTheDocument();
  });

  it("drops Today once a letter is no longer sending, and adds when it ended", () => {
    render(<LetterPlate letter={STOPPED} />);
    expect(screen.queryByText(m.todayRow)).not.toBeInTheDocument();
    expect(screen.getByText(/^10 Sep.* IST by Rohan Iyer$/)).toBeInTheDocument();
  });
});
