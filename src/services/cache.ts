// In-memory TTL cache for deterministic public reads. Never stores anything
// user-scoped; only successful PNR outcomes, and only for one minute.

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: unknown; exp: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.exp < this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, exp: this.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

export const pnrCache = new MemoryCache();

export const CACHE_TTLS = {
  /** Reservation status can change at any moment; reads stay fresh. */
  snapshot: 60_000,
} as const;

/** Read-through helper: returns the cached value or computes, storing it only when `cacheable` agrees. */
export async function getOrCompute<T>(
  cache: Cache,
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
  cacheable: (value: T) => boolean = () => true,
): Promise<{ readonly value: T; readonly cached: boolean }> {
  const hit = cache.get<T>(key);
  if (hit !== undefined) return { value: hit, cached: true };
  const value = await compute();
  if (cacheable(value)) cache.set(key, value, ttlMs);
  return { value, cached: false };
}
