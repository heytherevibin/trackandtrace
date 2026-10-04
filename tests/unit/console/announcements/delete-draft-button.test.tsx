import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consoleMessages } from "@/console/messages";

const { refresh, requestDelete, success, error } = vi.hoisted(() => ({ refresh: vi.fn(), requestDelete: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/console/announcements/letters-client", () => ({ requestDelete }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { DeleteDraftButton } from "@/console/announcements/delete-draft-button";

// Deleting a draft: not on the sheet, asked for by the owner on 2026-10-04. It asks first, names
// the draft, and says what is true of every draft: it has gone to nobody.
const m = consoleMessages.announcements;
const ID = "a0000000-0000-4000-8000-000000000001";
const SUBJECT = "Trakline news: what's coming next";
const button = () => render(<DeleteDraftButton id={ID} subject={SUBJECT} />);
const trigger = () => screen.getByRole("button", { name: m.letters.deleteLabel(SUBJECT) });

beforeEach(() => {
  for (const fn of [refresh, requestDelete, success, error]) fn.mockReset();
});

describe("DeleteDraftButton", () => {
  it("reads Delete, and names its draft to a screen reader: every draft row has one", () => {
    button();
    expect(trigger()).toHaveTextContent(m.letters.delete);
  });

  it("asks first, with the draft's subject, and deletes nothing yet", async () => {
    button();
    await userEvent.click(trigger());
    const dialog = screen.getByRole("alertdialog", { name: m.deleteDialog.title });
    expect(within(dialog).getByText(SUBJECT)).toBeInTheDocument();
    expect(within(dialog).getByText(m.deleteDialog.detail)).toBeInTheDocument();
    expect(requestDelete).not.toHaveBeenCalled();
  });

  it("deletes on confirm, says so, and redraws the list", async () => {
    requestDelete.mockResolvedValue({ kind: "done" });
    button();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: m.deleteDialog.confirm }));
    expect(requestDelete).toHaveBeenCalledWith(ID);
    expect(success).toHaveBeenCalledWith(m.deleteDialog.done);
    expect(refresh).toHaveBeenCalled();
  });

  it("changes nothing on Cancel", async () => {
    button();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requestDelete).not.toHaveBeenCalled();
  });

  it("shows why a delete failed, and still redraws: the draft may have been queued meanwhile", async () => {
    requestDelete.mockResolvedValue({ kind: "failed", message: m.errors.notDeletable });
    button();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: m.deleteDialog.confirm }));
    expect(error).toHaveBeenCalledWith(m.errors.notDeletable);
    expect(refresh).toHaveBeenCalled();
  });
});
