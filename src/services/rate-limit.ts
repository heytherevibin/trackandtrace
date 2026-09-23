import type { WindowLimiter, WindowLimiterFactory } from "./upstash";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (prev.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((prev[0] + windowMs - now) / 1000));
      return { ok: false, remaining: 0, retryAfterSeconds };
    }
    prev.push(now);
    this.hits.set(key, prev);
    if (this.hits.size > 10_000) {
      for (const [k, ts] of this.hits) {
        if (ts.every((t) => t <= cutoff)) this.hits.delete(k);
      }
    }
    return { ok: true, remaining: limit - prev.length, retryAfterSeconds: 0 };
  }
}

export interface SharedRateLimiterOptions {
  readonly windows: WindowLimiterFactory;
  /** One-way: the store never sees an address or a user id. */
  readonly identify: (key: string) => string;
  /** Applies whenever the store is slow or failing, so traffic stays limited per instance. */
  readonly fallback?: RateLimiter;
  readonly onFallback?: (reason: "timeout" | "error") => void;
  readonly now?: () => number;
}

/** Sliding windows shared by every instance; this instance's memory limiter when the store can't answer. */
export class SharedRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowLimiter>();
  private readonly options: SharedRateLimiterOptions;
  private readonly fallback: RateLimiter;
  private readonly now: () => number;

  constructor(options: SharedRateLimiterOptions) {
    this.options = options;
    this.fallback = options.fallback ?? new MemoryRateLimiter();
    this.now = options.now ?? Date.now;
  }

  private window(limit: number, windowMs: number): WindowLimiter {
    const id = `${limit}:${windowMs}`;
    const known = this.windows.get(id);
    if (known) return known;
    const made = this.options.windows(limit, windowMs);
    this.windows.set(id, made);
    return made;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const verdict = await this.window(limit, windowMs).limit(this.options.identify(key));
      if (verdict.reason === "timeout") {
        this.options.onFallback?.("timeout");
        return this.fallback.check(key, limit, windowMs);
      }
      if (verdict.success) return { ok: true, remaining: verdict.remaining, retryAfterSeconds: 0 };
      return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((verdict.reset - this.now()) / 1000)) };
    } catch {
      this.options.onFallback?.("error");
      return this.fallback.check(key, limit, windowMs);
    }
  }
}

/** Client IP from a request — first XFF hop outside the loopback trust list. */
export function clientIp(ip: string | null, xff: string | null): string {
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return ip ?? "unknown";
}

/** Addresses nobody can read share one limit, so a garbled header can't mint fresh ones. */
export const UNREADABLE_ADDRESS = "unreadable";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

function ipv4Parts(text: string): readonly number[] | null {
  return IPV4.test(text) ? text.split(".").map(Number) : null;
}

/** The address without brackets, a port or a zone: "[2001:db8::1]:443" → "2001:db8::1". */
function bareAddress(raw: string): string {
  const text = raw.trim();
  if (text.startsWith("[")) {
    const close = text.indexOf("]");
    return close === -1 ? "" : text.slice(1, close).split("%")[0];
  }
  const colon = text.indexOf(":");
  if (colon > 0 && colon === text.lastIndexOf(":") && text.slice(0, colon).includes(".")) return text.slice(0, colon);
  return text.split("%")[0];
}

/** The eight 16-bit groups of an IPv6 address, or null when it isn't one. */
function ipv6Groups(text: string): readonly number[] | null {
  const lastColon = text.lastIndexOf(":");
  if (lastColon === -1) return null;
  let body = text.toLowerCase();
  const tail: number[] = [];
  if (body.slice(lastColon + 1).includes(".")) {
    const quad = ipv4Parts(body.slice(lastColon + 1));
    if (!quad) return null;
    tail.push((quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3]);
    body = body.slice(0, lastColon + 1);
    if (!body.endsWith("::")) body = body.slice(0, -1);
  }
  const halves = body.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    return groups.every((g) => HEXTET.test(g)) ? groups.map((g) => parseInt(g, 16)) : null;
  };
  const left = parse(halves[0]);
  const right = halves.length === 2 ? parse(halves[1]) : [];
  if (!left || !right) return null;
  const given = left.length + right.length + tail.length;
  if (halves.length === 2) return given <= 7 ? [...left, ...new Array<number>(8 - given).fill(0), ...right, ...tail] : null;
  return given === 8 ? [...left, ...tail] : null;
}

/**
 * The part of an address one client controls, which limits are keyed by: an IPv4 address whole,
 * an IPv6 address by its /64 network (one home or phone gets a whole /64 to rotate through), and
 * an IPv4-mapped IPv6 address as the IPv4 address it carries.
 */
export function addressKey(raw: string): string {
  const host = bareAddress(raw);
  if (ipv4Parts(host)) return host;
  const groups = ipv6Groups(host);
  if (!groups) return UNREADABLE_ADDRESS;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

export const PNR_RATE_LIMIT = { limit: 20, windowMs: 60_000 };
