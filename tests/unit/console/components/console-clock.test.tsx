import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleClock } from "@/console/components/console-clock";

// 2026-09-21T09:02:00Z is 14:32 IST (UTC+5:30) -- Main.dc.html:41's own mock instant.
const FOURTEEN_THIRTY_TWO_IST = "2026-09-21T09:02:00.000Z";

describe("the console clock", () => {
  it("shows the time in IST, the figure then the legend", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setInterval", "clearInterval"] });
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
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setInterval", "clearInterval"] });
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

  it("clears its timer on unmount", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setInterval", "clearInterval"] });
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
