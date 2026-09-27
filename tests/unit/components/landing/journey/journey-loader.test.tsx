import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneyLoader, WATCHDOG_MS, type LoadJourney } from "@/components/landing/journey/journey-loader";

const html = () => document.documentElement;

describe("JourneyLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    html().removeAttribute("data-journey");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("imports the journey once the page is idle, starts it, and stops it on unmount", async () => {
    const stop = vi.fn();
    const startJourney = vi.fn(() => stop);
    const load: LoadJourney = vi.fn(async () => ({ startJourney }));
    const { unmount } = render(<JourneyLoader load={load} />);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("marks the journey failed when its chunk cannot load", async () => {
    const load: LoadJourney = () => Promise.reject(new Error("blocked"));
    render(<JourneyLoader load={load} />);
    await vi.advanceTimersByTimeAsync(1);
    expect(html().getAttribute("data-journey")).toBe("failed");
  });

  it("gives up after the watchdog, and ignores a chunk that arrives too late", async () => {
    const startJourney = vi.fn(() => () => {});
    let arrive: (value: { startJourney: typeof startJourney }) => void = () => {};
    const late = new Promise<{ startJourney: typeof startJourney }>((resolve) => {
      arrive = resolve;
    });
    render(<JourneyLoader load={() => late} />);
    await vi.advanceTimersByTimeAsync(WATCHDOG_MS);
    expect(html().getAttribute("data-journey")).toBe("failed");
    arrive({ startJourney });
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).not.toHaveBeenCalled();
  });

  it("marks the journey failed when starting it throws", async () => {
    const load: LoadJourney = async () => ({
      startJourney: () => {
        throw new Error("boom");
      },
    });
    render(<JourneyLoader load={load} />);
    await vi.advanceTimersByTimeAsync(1);
    expect(html().getAttribute("data-journey")).toBe("failed");
  });

  it("survives Strict Mode's double mount with one live journey", async () => {
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const startJourney = vi.fn(() => {
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    });
    render(
      <StrictMode>
        <JourneyLoader load={async () => ({ startJourney })} />
      </StrictMode>,
    );
    await vi.advanceTimersByTimeAsync(1);
    const live = startJourney.mock.calls.length - stops.filter((s) => s.mock.calls.length > 0).length;
    expect(live).toBe(1);
  });

  it("tells the journey whether the frame meter is allowed", async () => {
    const startJourney = vi.fn(() => () => {});
    render(<JourneyLoader load={async () => ({ startJourney })} hud />);
    await vi.advanceTimersByTimeAsync(1);
    expect(startJourney).toHaveBeenCalledWith({ hud: true });
  });
});
