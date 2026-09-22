import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above every import and above any ordinary top-level const, so both
// mocks are declared with vi.hoisted (the same trap tests/unit/console/components/confirm-its-you
// .test.tsx records). runTap is mocked rather than ConfirmItsYou itself: the dialog under test must
// really be TC-01, or "no Change line" and "the drawn summary" would be assertions about a stub.
const { runTap, prepareAuditExport, twice } = vi.hoisted(() => ({
  runTap: vi.fn(),
  prepareAuditExport: vi.fn(),
  // Off for every case but the one that turns it on. See `confirmedTwice` below.
  twice: { on: false },
}));
vi.mock("@/console/keys/tap-client", () => ({ runTap }));
vi.mock("@/console/audit/audit-client", () => ({ prepareAuditExport }));

/**
 * The real TC-01, with one thing changed: when `twice.on`, its `onConfirmed` fires twice in the
 * same tick.
 *
 * That is not something a member can do today -- ConfirmItsYou's own `attemptRef` collapses two
 * rapid presses into one call -- and that is exactly why the provider's `inFlight` guard had no
 * test and could be deleted with all seventeen cases still green. The guard is not about
 * ConfirmItsYou's current internals: it is the provider saying "one export per confirmation,
 * however my `onConfirmed` is called", and ConfirmItsYou is a shared component that four more
 * modules will keep editing. So the contract is tested at the seam it is a contract about, rather
 * than through whichever collapsing logic the caller happens to have this month.
 */
vi.mock("@/console/components/confirm-its-you", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/console/components/confirm-its-you")>();
  return {
    ConfirmItsYou: (props: ComponentProps<typeof real.ConfirmItsYou>) => (
      <real.ConfirmItsYou
        {...props}
        onConfirmed={() => {
          props.onConfirmed();
          if (twice.on) props.onConfirmed();
        }}
      />
    ),
  };
});

import { AuditExportButton, AuditExportProvider, AuditExportStatus } from "@/console/audit/export-dialog";
import { AUDIT_EXPORT_ACTION, AUDIT_EXPORT_MAX, defaultAuditFilters, type AuditFilters } from "@/console/audit/filters";

// 19 September 2026, 13:30 IST -- AuditLog.dc.html's own day, so the summary and the file name
// below are checked against the sheet.
const NOW = new Date("2026-09-19T08:00:00.000Z");
const BASE: AuditFilters = defaultAuditFilters("production");
const RANGE = "2026-09-18T18:30:00.000Z/2026-09-19T18:30:00.000Z";
const FILTERS = '{"category":null,"deployment":"production","environment":"production","member":null,"result":null,"search":null}';
const REASON = "Monthly access review for September.";
const READY = { csv: "﻿id,at\r\n1,2", count: 14, fileName: "audit-2026-09-19.csv" };

/**
 * `strict` is not a flourish. The first cut of this component prepared the export from inside a
 * `setStage(current => …)` updater, and React proves an updater is pure by calling it twice in
 * development -- so one press became two exports: the first spent the tap, the second was refused
 * for a tap that was already used, and the member was left reading "That confirmation no longer
 * matches this export". Every test in this file passed, because `render()` on its own invokes an
 * updater once. The e2e run in a real `next dev` is what found it. The cases marked `strict` below
 * are what find it here.
 */
function board(total = 14, filters: AuditFilters = BASE, strict = false) {
  const tree = (
    <AuditExportProvider filters={filters} environment="production" total={total}>
      <AuditExportButton />
      <AuditExportStatus />
    </AuditExportProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Opens TC-01, types a reason and taps -- the whole confirm step, as a member performs it. */
async function confirm(user: ReturnType<typeof userEvent.setup>, reason = REASON): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Export CSV" }));
  await user.type(screen.getByLabelText("Reason"), reason);
  await user.click(screen.getByRole("button", { name: "Tap your key" }));
}

let clicked: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  // Fake timers, because two of the assertions below are about a ten-minute lifetime, and
  // `shouldAdvanceTime` so user-event's own waits still resolve against them. Pairing them the
  // other documented way instead -- `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` --
  // was measured here and hangs every case in this file to its five-second timeout.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  runTap.mockReset().mockResolvedValue({ kind: "done" });
  prepareAuditExport.mockReset().mockResolvedValue({ ok: true, data: READY });
  twice.on = false;
  clicked = [];
  revoked = [];
  // jsdom has no object URLs and no download of any kind; the two halves of the press are recorded
  // instead, which is what the assertions are actually about.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:audit-1");
  globalThis.URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the confirm step", () => {
  // AuditLog.dc.html:232-251 draws the export's confirm step as Form TC-01 -- "Confirm it's you", a
  // Reason field, the standard hint, "Tap your key" -- and not as a plain "are you sure".
  it("is Form TC-01, with the sheet's own summary", async () => {
    const user = userEvent.setup();
    board();
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
    expect(screen.getByText("Form TC-01")).toBeInTheDocument();
    expect(screen.getByText("Export 14 audit entries from today")).toBeInTheDocument();
  });

  // The Change line has been optional since the Team phase, and this is the shape it was made
  // optional for: an export has no before-and-after pair, and a label with nothing after it says
  // less than no row.
  it("draws no Change line", async () => {
    const user = userEvent.setup();
    board();
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.queryByText("Change")).not.toBeInTheDocument();
  });

  it("counts what it is about to export, and says so in the singular when there is one", async () => {
    const user = userEvent.setup();
    board(1);
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.getByText("Export 1 audit entry from today")).toBeInTheDocument();
  });

  // The four digest fields, exactly as console.use_tap will re-digest them: the action, the
  // half-open range, the other five filters, the reason. The two strings are the ones
  // src/console/audit/filters.ts canonicalises, and nothing here reshapes them.
  it("takes the tap over the export's own four fields", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    expect(runTap).toHaveBeenCalledWith({ action: AUDIT_EXPORT_ACTION, target: RANGE, value: FILTERS, reason: REASON });
  });

  // A tap minted for one export must be spendable on that export and no other, and the digest is
  // what enforces it -- so a narrowed filter has to change what is digested.
  it("takes a different tap for a different filter", async () => {
    const user = userEvent.setup();
    board(14, { ...BASE, result: "refused" });
    await confirm(user);
    expect(runTap).toHaveBeenCalledWith(expect.objectContaining({ value: expect.stringContaining('"result":"refused"') }));
  });

  it("starts nothing when the member cancels", async () => {
    const user = userEvent.setup();
    board();
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(runTap).not.toHaveBeenCalled();
    expect(prepareAuditExport).not.toHaveBeenCalled();
  });

  it("prepares nothing when the key does not answer", async () => {
    runTap.mockResolvedValue({ kind: "failed", message: "That key didn't answer." });
    const user = userEvent.setup();
    board();
    await confirm(user);
    expect(prepareAuditExport).not.toHaveBeenCalled();
  });

  // Nothing the database would refuse should cost a member a ceremony. The count is on screen
  // already, so the refusal can come before the dialog rather than after the tap.
  it("refuses a set larger than one export can carry, without asking for a tap", async () => {
    const user = userEvent.setup();
    board(AUDIT_EXPORT_MAX + 1);
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/narrow the range/i);
    expect(runTap).not.toHaveBeenCalled();
  });
});

describe("preparing, and ready", () => {
  // AuditLog.dc.html:136-147 draws both on the board, between the chip row and the Entries plate,
  // and not inside the dialog: the dialog closes when the key answers.
  it("shows the sheet's preparing line while the export is in flight", async () => {
    let settle: ((value: unknown) => void) | undefined;
    prepareAuditExport.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Preparing export… 14 entries from today."));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    settle?.({ ok: true, data: READY });
  });

  it("sends the same two strings the tap was taken over", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(prepareAuditExport).toHaveBeenCalledWith({ range: RANGE, filters: FILTERS, reason: REASON }));
  });

  it("draws the file, the sheet's own line about it, and Download", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByText("audit-2026-09-19.csv")).toBeInTheDocument());
    expect(screen.getByText("Works once, in this browser, for 10 minutes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("says what went wrong when the export is refused, and offers no file", async () => {
    prepareAuditExport.mockResolvedValue({ ok: false, error: { ok: false, code: "INVALID_INPUT", message: "That confirmation no longer matches this export. Try exporting again." } });
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That confirmation no longer matches this export. Try exporting again."));
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });
});

describe("the prepared export itself", () => {
  // "Works once, in this browser, for 10 minutes" is the specification, and all three parts of it
  // are true of a Blob held in this component and of nothing else: it was never written anywhere a
  // second request could reach, so there is no link to leak and nothing to replay.
  it("hands the member the file under the name the range gave it", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(clicked).toEqual(["audit-2026-09-19.csv"]);
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("works once -- the file is let go the moment it has been handed over", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(revoked).toEqual(["blob:audit-1"]);
  });


  // The two halves of the press, each of which React's development double-invoke would repeat if
  // either lived inside a state updater. One press must spend one tap and hand over one file.
  it("prepares one export per confirmation, even under React's double-invoke", async () => {
    const user = userEvent.setup();
    board(14, BASE, true);
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    expect(prepareAuditExport).toHaveBeenCalledTimes(1);
  });


  // The `inFlight` guard, at the seam it is a contract about. Without it both calls read the same
  // `stage.kind === "confirm"` -- the render they were made in has not committed yet -- and both
  // POST: two taps' worth of work from one ceremony, two audit rows, and the second answer (a
  // refusal for a tap that is already spent) is the one the member is left reading.
  it("prepares one export per confirmation, however many times its confirmation fires", async () => {
    twice.on = true;
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    expect(prepareAuditExport).toHaveBeenCalledTimes(1);
  });

  it("hands the file over once per press, under the same conditions", async () => {
    const user = userEvent.setup();
    board(14, BASE, true);
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(clicked).toEqual(["audit-2026-09-19.csv"]);
  });


  // The throttled tab, and the machine that slept. A setTimeout is not a deadline: the clock moves
  // here without the timer ever running, which is exactly what a background tab or a lid closed for
  // an hour does to it. Ten minutes has to mean ten minutes on both.
  it("hands nothing over once the ten minutes have passed, even if the timer never fired", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    // The clock only -- no advanceTimersByTime, so the expiry timeout is still pending.
    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000));
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(clicked).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument());
  });

  it("and for ten minutes -- an untouched one is let go when they run out", async () => {
    const user = userEvent.setup();
    board();
    await confirm(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument());
  });
});
