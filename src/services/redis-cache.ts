import type { Cache } from "./cache";
import { open, seal } from "./cache-cipher";
import { keyedHash, type DataKeys } from "./data-key";
import type { RedisLike } from "./upstash";

// The shared read-through cache. Redis sees an HMAC of the key and an AES-GCM
// sealed value, never a PNR or a record in the clear. Every failure (unreachable,
// slow, unreadable, tampered, rotated key) is a miss.

export interface RedisCacheOptions {
  readonly redis: RedisLike;
  readonly keys: Pick<DataKeys, "cacheName" | "cacheValue">;
  /** e.g. "tt:production:pnr:v1" */
  readonly namespace: string;
  readonly onError?: (error: unknown) => void;
}

export class EncryptedRedisCache implements Cache {
  constructor(private readonly options: RedisCacheOptions) {}

  private name(key: string): string {
    return `${this.options.namespace}:${keyedHash(this.options.keys.cacheName, key)}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const name = this.name(key);
    try {
      const sealed = await this.options.redis.get(name);
      if (typeof sealed !== "string") return undefined;
      const json = open(this.options.keys.cacheValue, name, sealed);
      return json === null ? undefined : (JSON.parse(json) as T);
    } catch (error) {
      this.options.onError?.(error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const name = this.name(key);
    try {
      await this.options.redis.set(name, seal(this.options.keys.cacheValue, name, JSON.stringify(value)), { px: ttlMs });
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.options.redis.del(this.name(key));
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}
