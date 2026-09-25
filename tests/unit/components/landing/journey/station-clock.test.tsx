import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StationClock } from "@/components/landing/journey/station-clock";

describe("StationClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T06:30:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the time in India with its hands, and says it in words", () => {
    const { container } = render(<StationClock />);
    const clock = screen.getByRole("img", { name: "Station clock: 12:00 IST" });
    expect(clock).toBeInTheDocument();
    expect(container.querySelector(".clock-hand.is-hour")).toHaveAttribute("transform", "rotate(0)");
    expect(container.querySelector(".clock-hand.is-minute")).toHaveAttribute("transform", "rotate(0)");
  });

  it("moves on as the minutes pass", () => {
    const { container } = render(<StationClock />);
    act(() => {
      vi.setSystemTime(new Date("2026-09-17T06:45:00.000Z"));
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole("img", { name: "Station clock: 12:15 IST" })).toBeInTheDocument();
    expect(container.querySelector(".clock-hand.is-minute")).toHaveAttribute("transform", "rotate(90)");
  });
});
