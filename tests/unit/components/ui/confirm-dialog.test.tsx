import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ConsoleAnnouncementsPhone.dc.html draws "Stop sending?" as a sheet rising from the bottom edge,
// its two buttons stacked full width with the action on top. From `sm` up it is the centred dialog.
describe("ConfirmDialog as a phone sheet", () => {
  const dialog = (phoneSheet: boolean) =>
    render(<ConfirmDialog open onOpenChange={() => {}} title="Stop sending?" description="262 people already have this letter." confirmLabel="Stop sending" tone="primary" phoneSheet={phoneSheet} onConfirm={() => {}} />);

  it("anchors to the bottom edge below sm, and centres from sm up", () => {
    dialog(true);
    const viewport = screen.getByRole("alertdialog").parentElement as HTMLElement;
    expect(viewport.className).toContain("max-sm:items-end");
    expect(viewport.className).toContain("max-sm:p-0");
  });

  it("stacks its buttons with the action first below sm", () => {
    dialog(true);
    const actions = screen.getByRole("button", { name: "Stop sending" }).parentElement as HTMLElement;
    expect(actions.className).toContain("max-sm:flex-col-reverse");
  });

  it("is the centred dialog it always was when not asked to be a sheet", () => {
    dialog(false);
    const viewport = screen.getByRole("alertdialog").parentElement as HTMLElement;
    expect(viewport.className).not.toContain("max-sm:items-end");
  });
});
