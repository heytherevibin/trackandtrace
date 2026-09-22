import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The row menu (ConsoleTeam.dc.html:145 for its trigger, :193-199 for the menu itself). Task 5 drew
// all three items and wired the first; Task 6 wires the other two, so every item now opens the
// dialog the sheet draws for it (task-5-addendum.md §5, task-6-addendum.md §5).
const { changeRole, resetKeys, removeMember } = vi.hoisted(() => ({ changeRole: vi.fn(), resetKeys: vi.fn(), removeMember: vi.fn() }));
const { runTap } = vi.hoisted(() => ({ runTap: vi.fn() }));
vi.mock("@/console/team/team-client", () => ({ changeRole, resetKeys, removeMember }));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/components/ui/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { MemberRowMenu } from "@/console/team/member-row-menu";
import type { TeamMember } from "@/console/team/team";

const KIRAN: TeamMember = {
  userId: "d1111111-1111-1111-1111-111111111111",
  email: "kiran@trakline.in",
  name: "Kiran Das",
  role: "support",
  status: "active",
  keyCount: 2,
  lastActiveAt: "2026-09-21T08:32:00Z",
};

beforeEach(() => {
  changeRole.mockReset();
  resetKeys.mockReset();
  removeMember.mockReset();
  runTap.mockReset();
});

function draw() {
  return render(<MemberRowMenu member={KIRAN} signedInId="aaaaaaaa-0000-0000-0000-000000000001" activeOwners={2} />);
}

/** Opens the menu and waits for its content -- Base UI positions it asynchronously. */
async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Actions for Kiran Das" }));
  await screen.findByRole("menuitem", { name: "Change role" });
  return user;
}

describe("MemberRowMenu", () => {
  it("names its trigger after the member, exactly as the sheet draws it", () => {
    draw();
    expect(screen.getByRole("button", { name: "Actions for Kiran Das" })).toBeInTheDocument();
  });

  it("opens the sheet's three items, in the sheet's own order", async () => {
    draw();
    await openMenu();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Change role", "Reset keys", "Remove"]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  // :194 gives the open menu the very same `aria-label` as the trigger that opened it, so a screen
  // reader hears which member's actions these are. Asserted rather than assumed: the menu takes its
  // name from the trigger, which is only true while the trigger has one of its own.
  it("carries the member's name onto the open menu too", async () => {
    draw();
    await openMenu();
    expect(screen.getByRole("menu", { name: "Actions for Kiran Das" })).toBeInTheDocument();
  });

  // This assertion was Task 5's, and it read the opposite way: it pinned Reset keys and Remove as
  // `aria-disabled="true"` so neither pretended to work while only Change role was wired. Task 6
  // wires both, so the fact worth holding is now that no item is inert -- deliberately rewritten
  // rather than deleted, because "all three items are live" is exactly what the old assertion would
  // otherwise have stopped saying anything about.
  it("leaves none of the three inert now that all three are wired", async () => {
    draw();
    await openMenu();
    for (const name of ["Change role", "Reset keys", "Remove"]) {
      expect(screen.getByRole("menuitem", { name }), name).not.toHaveAttribute("aria-disabled", "true");
    }
  });

  it("opens the change-role flow from its first item", async () => {
    draw();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Change role" }));
    expect(await screen.findByRole("heading", { name: "Change Kiran Das's role" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "New role" })).toBeInTheDocument();
  });

  it("opens the reset-keys confirmation from its second item", async () => {
    draw();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Reset keys" }));
    expect(await screen.findByText("Reset Kiran Das's keys")).toBeInTheDocument();
    expect(screen.getByText("Form TC-01")).toBeInTheDocument();
  });

  it("opens the remove confirmation from its last item", async () => {
    draw();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(await screen.findByText("Remove Kiran Das from the console")).toBeInTheDocument();
    expect(screen.getByText("Form TC-01")).toBeInTheDocument();
  });

  it("opens nothing until an item is used", () => {
    draw();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  // Only one at a time: each item replaces whatever the last one opened, so a member can never
  // have two confirmations stacked over one row.
  it("opens one dialog at a time", async () => {
    draw();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Reset keys" }));
    await screen.findByText("Reset Kiran Das's keys");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Actions for Kiran Das" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(await screen.findByText("Remove Kiran Das from the console")).toBeInTheDocument();
    expect(screen.queryByText("Reset Kiran Das's keys")).not.toBeInTheDocument();
  });
});

// A refusal comes back after TC-01 has already closed (ConfirmItsYou's onConfirmed fires the moment
// the tap verifies, before the request this menu then sends), so there is no dialog left to show it
// in -- the same thing src/console/account/keys-plate.tsx found for Remove, and it answered the same
// way: an alert that stays on screen beside the control that would retry it, never a toast that
// goes away.
describe("MemberRowMenu's refusals", () => {
  const REFUSED = "The team has changed since this page loaded. Reload it and try again.";

  /** Opens Reset keys, taps through, and lets the mocked resetKeys refuse. */
  async function refuseAReset(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("menuitem", { name: "Reset keys" }));
    await user.type(await screen.findByLabelText("Reason"), "Lost a security key on the train.");
    await user.click(screen.getByRole("button", { name: "Tap your key" }));
  }

  // The live region is rendered from the start and empty while there is nothing to say (Minor 1 of
  // the task-6 review: a role="alert" inserted already carrying its message relies on
  // node-insertion announcement, the less reliable of the two shapes). So this waits for the
  // region's *text* to arrive rather than for the element itself, which was there all along.
  it("keeps a refused reset on screen, beside the menu that would retry it", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    resetKeys.mockResolvedValue({ kind: "failed", message: REFUSED });
    draw();
    const user = await openMenu();
    await refuseAReset(user);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(REFUSED));
  });

  it("mounts that live region empty rather than inserting it with its message", () => {
    draw();
    const region = screen.getByRole("alert");
    expect(region).toBeInTheDocument();
    expect(region).toBeEmptyDOMElement();
  });

  // Cleared when the next attempt opens, not when it lands: a sentence about an attempt that has
  // already been replaced is worse than none (the rule Task 5's own picker alert follows).
  //
  // Asserted on the TEXT, not on `queryByRole("alert")`. The first version of this test used the
  // role and could not fail: it ran while the next TC-01 was open, and Base UI marks the page
  // behind a modal `inert`/`aria-hidden`, so *every* role query returns null there whether the
  // refusal was cleared or not. The review's probe found the `<p>` still in the DOM with its text
  // intact under a mutation that deleted the clearing. `queryByText` does not filter by
  // accessibility, so it sees through the inert page and the assertion is about the thing it
  // claims to be about. Confirmed by deleting `setError(null)` from member-row-menu.tsx and
  // watching this fail; see task-6-report.md's fix-round section.
  it("drops a previous refusal the moment another item is opened", async () => {
    runTap.mockResolvedValue({ kind: "done" });
    resetKeys.mockResolvedValue({ kind: "failed", message: REFUSED });
    draw();
    const user = await openMenu();
    await refuseAReset(user);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(REFUSED));
    await user.click(screen.getByRole("button", { name: "Actions for Kiran Das" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
    await screen.findByText("Remove Kiran Das from the console");
    expect(screen.queryByText(REFUSED)).toBeNull();
    // And still gone once the dialog that was hiding the page closes, so this is not merely the
    // modal's inerting seen from the other side.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(REFUSED)).toBeNull();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});
