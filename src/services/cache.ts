// TTL cache for deterministic public reads. Never stores anything user-scoped;
// only successful PNR outcomes, and only for one minute. Async, so the shared
// Redis cache (redis-cache.ts) can stand in for this instance's memory.

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: unknown; exp: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.exp < this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { value, exp: this.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export const pnrCache = new MemoryCache();

export const CACHE_TTLS = {
  /** Reservation status can change at any moment; reads stay fresh. */
  snapshot: 60_000,
} as const;
