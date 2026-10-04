import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComposeReadonly } from "@/console/announcements/compose-readonly";
import type { ListCounts } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

// ConsoleAnnouncementsPhone.dc.html, Compose: on a phone the console reads, and does the urgent
// thing. Writing a letter is neither, so the draft is drawn as text with no control on it at all.
const m = consoleMessages.announcements;
const LISTS: ListCounts = { news: 431, availability: 0, availabilitySpent: true, availabilitySpentAt: null };
const DRAFT = { id: "a0000000-0000-4000-8000-000000000001", list: "news" as const, subject: "Trakline news: what's coming next", body: "Hello,\n\nTwo things.", testSentAt: null, testSentTo: null };

describe("ComposeReadonly", () => {
  it("draws the draft as text, with no field and no button", () => {
    render(<ComposeReadonly letter={DRAFT} lists={LISTS} />);
    expect(screen.getByText(m.phone.note)).toBeInTheDocument();
    expect(screen.getByText(DRAFT.subject)).toBeInTheDocument();
    expect(screen.getByText(m.phone.listLine("News", "431"))).toBeInTheDocument();
    expect(screen.getByText(m.compose.test.notSent)).toBeInTheDocument();
    expect(screen.getByText(m.phone.queueOff)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says where to queue a draft that has been tested", () => {
    render(<ComposeReadonly letter={{ ...DRAFT, testSentAt: "2026-09-19T08:50:00+00:00", testSentTo: "asha@example.com" }} lists={LISTS} />);
    expect(screen.getByText(m.phone.queueElsewhere)).toBeInTheDocument();
  });

  it("says where to write a letter when there is no draft yet", () => {
    render(<ComposeReadonly letter={null} lists={LISTS} />);
    expect(screen.getByText(m.phone.newElsewhere)).toBeInTheDocument();
    expect(screen.queryByText(m.phone.note)).not.toBeInTheDocument();
  });
});
