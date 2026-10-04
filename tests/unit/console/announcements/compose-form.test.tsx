import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListCounts } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";

const { replace, refresh, requestSave, requestTest, requestQueue, success, error } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  requestSave: vi.fn(),
  requestTest: vi.fn(),
  requestQueue: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/console/announcements/letters-client", () => ({ requestSave, requestTest, requestQueue }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { ComposeForm, type ComposeLetter } from "@/console/announcements/compose-form";

// ---------------------------------------------------------------------------
// ConsoleAnnouncements.dc.html, Compose and Queue confirm. The board's rule is
// that Queue stays off, with its reason beside it, until a test send has been
// made. Two more reasons are this form's own: unsaved changes, and an empty list.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements;
const ID = "a0000000-0000-4000-8000-000000000001";
const LISTS: ListCounts = { news: 431, availability: 0, availabilitySpent: true, availabilitySpentAt: "2026-09-06T08:40:00+00:00" };
const NOW = "2026-09-19T09:02:00+00:00";
const DRAFT: ComposeLetter = { id: ID, list: "news", subject: "Trakline news: what's coming next", body: "Hello,\n\nTwo things.", testSentAt: null, testSentTo: null };
const TESTED: ComposeLetter = { ...DRAFT, testSentAt: "2026-09-19T08:50:00+00:00", testSentTo: "asha@example.com" };

const form = (letter: ComposeLetter | null, over: Partial<{ lists: ListCounts; ahead: { subject: string; more: number; days: number } | null }> = {}) =>
  render(<ComposeForm letter={letter} lists={over.lists ?? LISTS} email="asha@example.com" ahead={over.ahead ?? null} now={NOW} />);
const queue = () => screen.getByRole("button", { name: m.compose.queue });
const testButton = () => screen.getByRole("button", { name: m.compose.test.send });

beforeEach(() => {
  for (const fn of [replace, refresh, requestSave, requestTest, requestQueue, success, error]) fn.mockReset();
});

describe("a new letter", () => {
  it("cannot be tested or queued before it is saved, and says a test has not been made", () => {
    form(null);
    expect(testButton()).toBeDisabled();
    expect(queue()).toBeDisabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.notTested);
    expect(screen.getByText(m.compose.test.notSent)).toBeInTheDocument();
  });

  it("refuses an empty subject in the form's own words, without a request", async () => {
    form(null);
    await userEvent.type(screen.getByLabelText(m.compose.body), "Hello");
    await userEvent.click(screen.getByRole("button", { name: m.compose.save }));
    expect(screen.getByText(m.compose.subjectNeeded)).toBeInTheDocument();
    expect(requestSave).not.toHaveBeenCalled();
  });

  it("saves, says so, and moves to the draft's own address", async () => {
    requestSave.mockResolvedValue({ kind: "done", id: ID });
    form(null);
    await userEvent.type(screen.getByLabelText(m.compose.subject), "  What is coming ");
    await userEvent.type(screen.getByLabelText(m.compose.body), "Hello");
    await userEvent.click(screen.getByRole("button", { name: m.compose.save }));
    expect(requestSave).toHaveBeenCalledWith({ list: "news", subject: "What is coming", body: "Hello" });
    expect(success).toHaveBeenCalledWith(m.compose.saved);
    expect(replace).toHaveBeenCalledWith(`/announcements/${ID}`);
  });

  it("draws the spent Availability list disabled, with the day its one send finished", () => {
    form(null);
    const spent = screen.getByRole("radio", { name: /Availability/ });
    expect(spent).toHaveAttribute("aria-disabled", "true");
    expect(spent).toHaveTextContent(/^Availability\s*Spent\. Its one send finished on 0?6 Sep/);
    expect(screen.getByRole("radio", { name: /News/ })).toHaveTextContent("431 people confirmed.");
  });
});

describe("a saved draft", () => {
  it("can be tested, and still cannot be queued until it has been", async () => {
    requestTest.mockResolvedValue({ kind: "done" });
    form(DRAFT);
    expect(queue()).toBeDisabled();
    await userEvent.click(testButton());
    expect(requestTest).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.compose.test.done);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a failed test's reason and changes nothing", async () => {
    requestTest.mockResolvedValue({ kind: "failed", message: m.errors.testFailed });
    form(DRAFT);
    await userEvent.click(testButton());
    expect(error).toHaveBeenCalledWith(m.errors.testFailed);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("a tested draft", () => {
  it("can be queued, and says how many people and how long", () => {
    form(TESTED);
    expect(queue()).toBeEnabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.ready("431", 11));
    expect(screen.getByText(/^Sent at .* IST to asha@example\.com$/)).toBeInTheDocument();
  });

  it("says it goes after the letter ahead when there is one", () => {
    form(TESTED, { ahead: { subject: "A clearer chart view", more: 0, days: 4 } });
    expect(queue()).toHaveAccessibleDescription(m.compose.readyBehind("431", 11));
  });

  it("goes back to needing a save the moment its words change", async () => {
    form(TESTED);
    await userEvent.type(screen.getByLabelText(m.compose.body), " More.");
    expect(queue()).toBeDisabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.unsaved);
    expect(testButton()).toBeDisabled();
  });

  it("cannot be queued to a list with nobody on it", () => {
    form(TESTED, { lists: { ...LISTS, news: 0 } });
    expect(queue()).toBeDisabled();
    expect(queue()).toHaveAccessibleDescription(m.compose.nobody);
  });

  it("asks before queueing, naming the list, the subject, the people, the letter ahead and the finish", async () => {
    requestQueue.mockResolvedValue({ kind: "done", people: 431 });
    form(TESTED, { ahead: { subject: "A clearer chart view", more: 0, days: 4 } });
    await userEvent.click(queue());
    const dialog = screen.getByRole("alertdialog", { name: m.queueDialog.title });
    expect(within(dialog).getByText("431")).toBeInTheDocument();
    expect(within(dialog).getByText(m.queueDialog.behindOne("A clearer chart view", 4))).toBeInTheDocument();
    expect(within(dialog).getByText(m.queueDialog.takesBehind(11))).toBeInTheDocument();
    expect(within(dialog).getByText(/^Around 0?4 Oct/)).toBeInTheDocument();
    expect(requestQueue).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: m.queueDialog.confirm }));
    expect(requestQueue).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.compose.queued);
    expect(refresh).toHaveBeenCalled();
  });
});
