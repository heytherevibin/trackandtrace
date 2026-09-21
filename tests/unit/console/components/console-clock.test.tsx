import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleClock } from "@/console/components/console-clock";

// 2026-09-21T09:02:00Z is 14:32 IST (UTC+5:30) -- Main.dc.html:41's own mock instant.
const FOURTEEN_THIRTY_TWO_IST = "2026-09-21T09:02:00.000Z";

describe("the console clock", () => {
  it("shows the time in IST, the figure then the legend", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(FOURTEEN_THIRTY_TWO_IST));
    try {
      render(<ConsoleClock />);
      expect(screen.getByText("14:32")).toBeVisible();
      expect(screen.getByText("IST")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates once the clock crosses a minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(FOURTEEN_THIRTY_TWO_IST));
    try {
      render(<ConsoleClock />);
      expect(screen.getByText("14:32")).toBeVisible();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByText("14:33")).toBeVisible();
      expect(screen.queryByText("14:32")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Mounting at :00 is the one instant where a timer counting 60s from mount looks right. A member
  // opens the console whenever they open it, so the clock has to land on the wall-clock minute --
  // otherwise it reads a minute behind for most of every minute, for as long as the page is open.
  it("lands on the wall-clock minute however late in a minute it was opened", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-09-21T09:02:45.000Z"));
    try {
      render(<ConsoleClock />);
      expect(screen.getByText("14:32")).toBeVisible();

      // 15 seconds later it is 14:33, and the clock must say so.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText("14:33")).toBeVisible();

      // And it keeps landing on the minute, not 45 seconds after it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(screen.getByText("14:34")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its timer on unmount", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(FOURTEEN_THIRTY_TWO_IST));
    try {
      const { unmount } = render(<ConsoleClock />);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
