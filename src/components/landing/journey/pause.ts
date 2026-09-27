/** Waits for the page between two pieces of journey work, so they do not share a task (spec §3.H: no journey task at
 * load over 120 ms at 4× CPU): scheduler.yield where the browser has it, else a task. The scene keeps its own. */
export function pause(): Promise<void> {
  const scheduler: unknown = Reflect.get(window, "scheduler");
  const yielding: unknown = typeof scheduler === "object" && scheduler !== null ? Reflect.get(scheduler, "yield") : undefined;
  if (typeof yielding === "function") {
    const waited: unknown = Reflect.apply(yielding, scheduler, []);
    return Promise.resolve(waited).then(() => undefined);
  }
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
