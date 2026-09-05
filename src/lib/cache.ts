// Cache behind one interface: in-memory TTL now, Upstash Redis when the
// credentials exist. Never caches anything user-scoped or sensitive —
// only deterministic public reads (PNR snapshots, predictions).

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; exp: number }>();

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, exp: Date.now() + ttlMs });
  }
}

export const pnrCache = new MemoryCache();

export const CACHE_TTLS = {
  snapshot: 60_000, // status can change — keep reads fresh
  prediction: 120_000,
} as const;