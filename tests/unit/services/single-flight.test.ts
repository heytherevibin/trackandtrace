import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "@/services/single-flight";

function deferred<T>() {
  const box: { resolve: (v: T) => void; reject: (e: unknown) => void } = { resolve: () => {}, reject: () => {} };
  const promise = new Promise<T>((resolve, reject) => Object.assign(box, { resolve, reject }));
  return { promise, ...box };
}

describe("singleFlight", () => {
  it("shares one call between concurrent callers of the same key", async () => {
    const flight = singleFlight<number>();
    const gate = deferred<number>();
    const run = vi.fn(() => gate.promise);
    const both = Promise.all([flight("a", run), flight("a", run)]);
    gate.resolve(7);
    expect(await both).toEqual([7, 7]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs separate keys separately", async () => {
    const flight = singleFlight<string>();
    const run = vi.fn(async () => "x");
    await Promise.all([flight("a", run), flight("b", run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs again once the previous call settled, even after a failure", async () => {
    const flight = singleFlight<number>();
    await expect(flight("a", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    await expect(flight("a", async () => 2)).resolves.toBe(2);
  });
});
