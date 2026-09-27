import { afterEach, describe, expect, it, vi } from "vitest";
import { pause } from "@/components/landing/journey/pause";

// The wait between two pieces of journey work (spec §3.H): scheduler.yield where the browser has it, else a task.

describe("pause", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "scheduler");
    vi.useRealTimers();
  });

  it("waits on scheduler.yield where the browser has it", async () => {
    let yielded = () => {};
    const scheduler = { yield: vi.fn(() => new Promise<void>((resolve) => (yielded = resolve))) };
    Reflect.set(window, "scheduler", scheduler);
    let done = false;
    void pause().then(() => {
      done = true;
    });
    expect(scheduler.yield).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(done).toBe(false);
    yielded();
    await vi.waitFor(() => expect(done).toBe(true));
  });

  it("waits a task where it has not", async () => {
    vi.useFakeTimers();
    let done = false;
    void pause().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });
});
