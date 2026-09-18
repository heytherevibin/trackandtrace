/** Concurrent calls with the same key share one in-flight promise; the entry clears when it settles. */
export function singleFlight<T>(): (key: string, run: () => Promise<T>) => Promise<T> {
  const inflight = new Map<string, Promise<T>>();
  return (key, run) => {
    const pending = inflight.get(key);
    if (pending) return pending;
    const started = run().finally(() => inflight.delete(key));
    inflight.set(key, started);
    return started;
  };
}
