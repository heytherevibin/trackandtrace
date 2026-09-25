import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateField } from "@/components/ui/date-field";
import { messages } from "@/messages";

// The date field's own calendar.
//
// Chrome's popup is not in the document and takes no styling — it renders at its own size, in its
// own greys, with tap targets no phone standard would pass, and differently again on Firefox and on
// Windows. This one is ours, so these tests are the only thing standing between it and the same
// faults, and the bounds are the part that matters: a calendar that lets a reader pick a date the
// railway will not sell has spent a request to say no.

const c = messages.common.calendar;

function Harness({ min, max, initial = "" }: { readonly min?: string; readonly max?: string; readonly initial?: string }) {
  const [value, setValue] = useState(initial);
  return <DateField id="d" label="Journey date" value={value} min={min} max={max} onChange={setValue} todayIso="2026-10-16" />;
}

const openCalendar = () => fireEvent.click(screen.getByRole("button", { name: c.open }));
const grid = () => screen.getByRole("dialog", { name: c.open });
const day = (n: string) => within(grid()).getByRole("button", { name: new RegExp(`\\b${n}\\b`) });

describe("the date field's calendar", () => {
  it("opens on its own button and closes on Escape, giving focus back", () => {
    render(<Harness initial="2026-10-16" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openCalendar();
    expect(grid()).toBeVisible();
    fireEvent.keyDown(grid(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Escape that leaves focus nowhere strands a keyboard reader in the page body.
    expect(screen.getByRole("button", { name: c.open })).toHaveFocus();
  });

  it("writes the picked day into the field, in the form the input takes", () => {
    render(<Harness initial="2026-10-16" />);
    openCalendar();
    fireEvent.click(day("20"));
    // ISO, zero-padded, and local — a date built through UTC lands a day early east of Greenwich,
    // which for an IST reader is every date they pick after 05:30.
    expect(screen.getByLabelText("Journey date")).toHaveValue("2026-10-20");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refuses a day before the earliest the railway will sell", () => {
    render(<Harness initial="2026-10-16" min="2026-10-16" />);
    openCalendar();
    expect(day("15")).toBeDisabled();
    expect(day("16")).toBeEnabled();
    fireEvent.click(day("15"));
    expect(screen.getByLabelText("Journey date")).toHaveValue("2026-10-16");
  });

  it("refuses a day past the last one, too", () => {
    render(<Harness initial="2026-10-16" max="2026-10-20" />);
    openCalendar();
    expect(day("20")).toBeEnabled();
    expect(day("21")).toBeDisabled();
  });

  it("walks the month with the arrow keys and takes the day on Enter", () => {
    render(<Harness initial="2026-10-16" />);
    openCalendar();
    fireEvent.keyDown(grid(), { key: "ArrowRight" });
    fireEvent.keyDown(grid(), { key: "ArrowDown" });
    // One day on, then one week: the 16th becomes the 24th.
    fireEvent.keyDown(grid(), { key: "Enter" });
    expect(screen.getByLabelText("Journey date")).toHaveValue("2026-10-24");
  });

  it("crosses into the next month rather than stopping at its edge", () => {
    render(<Harness initial="2026-10-31" />);
    openCalendar();
    fireEvent.keyDown(grid(), { key: "ArrowRight" });
    fireEvent.keyDown(grid(), { key: "Enter" });
    expect(screen.getByLabelText("Journey date")).toHaveValue("2026-11-01");
  });

  it("still takes a typed date, because the keyboard was never the broken part", () => {
    const onChange = vi.fn();
    render(<DateField id="d" label="Journey date" value="" onChange={onChange} todayIso="2026-10-16" />);
    fireEvent.change(screen.getByLabelText("Journey date"), { target: { value: "2026-12-01" } });
    expect(onChange).toHaveBeenCalledWith("2026-12-01");
  });

  it("names every day in full, so a cell is not read aloud as a bare number", () => {
    render(<Harness initial="2026-10-16" />);
    openCalendar();
    expect(within(grid()).getByRole("button", { name: /Fri, 16 Oct 2026/ })).toBeInTheDocument();
  });
});
