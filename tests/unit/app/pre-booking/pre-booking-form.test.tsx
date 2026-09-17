import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreBookingForm } from "@/app/pre-booking/pre-booking-form";

// 06:30 UTC on 17 September 2026 is midday IST, so "today" in IST is 2026-09-17.
const NOW = new Date("2026-09-17T06:30:00.000Z");

const dateInput = () => screen.getByLabelText("Journey date");
const checkButton = () => screen.getByRole("button", { name: "Check availability" });
const pick = (value: string) => fireEvent.change(dateInput(), { target: { value } });
const lifecycle = () => within(screen.getByRole("list", { name: "Availability request lifecycle" })).getAllByRole("listitem");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PreBookingForm", () => {
  it("draws Form T&T-02 with an honest train box, the drawn options, and a disabled check", () => {
    render(<PreBookingForm />);
    expect(screen.getByRole("heading", { level: 2, name: "Availability request" })).toBeInTheDocument();
    expect(screen.getByText("Form T&T-02")).toBeInTheDocument();
    expect(screen.getByText("Train search: not connected")).toHaveAttribute("role", "status");

    const cls = screen.getByLabelText("Class") as HTMLSelectElement;
    expect(cls.value).toBe("3A");
    expect([...cls.options].map((o) => o.textContent)).toEqual([
      "1A · First AC",
      "2A · AC 2-tier",
      "3A · AC 3-tier",
      "SL · Sleeper",
      "CC · AC chair car",
      "EC · Executive chair",
      "2S · Second sitting",
    ]);
    const quota = screen.getByLabelText("Quota") as HTMLSelectElement;
    expect(quota.value).toBe("GN");
    expect([...quota.options].map((o) => o.textContent)).toEqual([
      "GN · General",
      "PQWL · Pooled",
      "RLWL · Remote location",
      "TQWL · Tatkal waitlist",
      "LD · Ladies",
      "TQ · Tatkal",
    ]);

    expect(dateInput()).toHaveAttribute("type", "date");
    expect(dateInput()).toHaveAttribute("min", "2026-09-17");
    expect(checkButton()).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "No availability returned" })).toBeNull();
  });

  it("refuses a past IST date with the drawn line and keeps the check disabled", () => {
    render(<PreBookingForm />);
    pick("2026-09-16");
    const message = screen.getByText("Pick today or a later date.");
    expect(dateInput()).toHaveAttribute("aria-invalid", "true");
    expect(dateInput().getAttribute("aria-describedby")).toBe(message.id);
    expect(checkButton()).toBeDisabled();
  });

  it("accepts today in IST", () => {
    render(<PreBookingForm />);
    pick("2026-09-17");
    expect(screen.queryByText("Pick today or a later date.")).toBeNull();
    expect(dateInput()).not.toHaveAttribute("aria-invalid");
    expect(checkButton()).toBeEnabled();
  });

  it("answers with the honest unavailable result and its evidence row", () => {
    render(<PreBookingForm />);
    pick("2027-01-15");
    fireEvent.click(checkButton());

    const heading = screen.getByRole("heading", { level: 2, name: "No availability returned" });
    const result = heading.closest(".blueprint") as HTMLElement;
    expect(result).not.toBeNull();
    expect(within(result).getByText("No timetable or inventory source is connected. Nothing was estimated. Requested: 3A · GN · 2027-01-15.")).toBeInTheDocument();
    const facts = [...result.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(facts).toEqual([
      ["Response", "Not received"],
      ["Provenance", "None"],
      ["Fallback", "Not used"],
    ]);
    expect(result.closest("[role=status]")).not.toBeNull();
  });

  it("records the class and quota chosen when the request was made", () => {
    render(<PreBookingForm />);
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "SL" } });
    fireEvent.change(screen.getByLabelText("Quota"), { target: { value: "TQ" } });
    pick("2027-01-15");
    fireEvent.click(checkButton());
    expect(screen.getByText(/Requested: SL · TQ · 2027-01-15\.$/)).toBeInTheDocument();
  });

  it("clears the result when the date changes", () => {
    render(<PreBookingForm />);
    pick("2027-01-15");
    fireEvent.click(checkButton());
    expect(screen.getByRole("heading", { name: "No availability returned" })).toBeInTheDocument();
    pick("2027-01-16");
    expect(screen.queryByRole("heading", { name: "No availability returned" })).toBeNull();
  });

  it("walks the lifecycle without faking the source or the result", () => {
    render(<PreBookingForm />);
    expect(screen.getByRole("heading", { level: 2, name: "Availability request lifecycle" })).toBeInTheDocument();
    expect(lifecycle().map((step) => [step.dataset.state, step.textContent])).toEqual([
      ["pending", "Request enteredWaiting for a request"],
      ["pending", "Request validatedWaiting for a request"],
      ["pending", "Inventory sourceAwaiting a connected source"],
      ["pending", "ResultUnavailable until connected"],
    ]);

    pick("2027-01-15");
    fireEvent.click(checkButton());
    expect(lifecycle().map((step) => [step.dataset.state, step.textContent])).toEqual([
      ["done", "Request enteredDone"],
      ["done", "Request validatedDone"],
      ["pending", "Inventory sourceAwaiting a connected source"],
      ["pending", "ResultUnavailable until connected"],
    ]);
  });

  it("wears registration marks on every plate", () => {
    const { container } = render(<PreBookingForm />);
    pick("2027-01-15");
    fireEvent.click(checkButton());
    const plates = [...container.querySelectorAll(".blueprint")];
    expect(plates).toHaveLength(3);
    for (const plate of plates) expect(plate.querySelectorAll(":scope > .corner")).toHaveLength(4);
  });
});
