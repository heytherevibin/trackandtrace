import { describe, expect, it, vi } from "vitest";
import { pingAccounts, pingStore } from "@/console/overview/pings";
import { MemoryKv, type Kv } from "@/services/kv";

// ---------------------------------------------------------------------------
// Service now's two connection rows. Each asks the cheapest question its service
// can answer, and a question that throws, times out or comes back refused is
// "not answering" — never a quiet pass.
// ---------------------------------------------------------------------------

describe("pingStore", () => {
  it("is connected when the store answers a read, even with nothing under the key", async () => {
    await expect(pingStore({ kv: new MemoryKv(), prefix: "tt:test" }, true)).resolves.toBe("connected");
  });

  it("is unreachable when the read throws", async () => {
    const broken = { get: vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))) } as unknown as Kv;
    await expect(pingStore({ kv: broken, prefix: "tt:test" }, true)).resolves.toBe("unreachable");
  });

  it("is local, without asking, when no shared store is configured — this server's memory always answers", async () => {
    const kv = { get: vi.fn() } as unknown as Kv;
    await expect(pingStore({ kv, prefix: "tt:test" }, false)).resolves.toBe("local");
    expect(kv.get).not.toHaveBeenCalled();
  });
});

describe("pingAccounts", () => {
  const CONFIG = { url: "https://abc.supabase.co", key: "sb_publishable_x" };

  it("asks the auth service's own health route with the publishable key", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(pingAccounts(CONFIG, fetcher)).resolves.toBe("connected");
    expect(fetcher).toHaveBeenCalledWith("https://abc.supabase.co/auth/v1/health", expect.objectContaining({ headers: { apikey: "sb_publishable_x" } }));
  });

  it("is unreachable on a refusal, which is an answer but not a healthy one", async () => {
    await expect(pingAccounts(CONFIG, vi.fn(async () => new Response("", { status: 503 })))).resolves.toBe("unreachable");
  });

  it("is unreachable when the request itself fails or times out", async () => {
    await expect(pingAccounts(CONFIG, vi.fn(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))))).resolves.toBe("unreachable");
  });

  it("is not configured, without asking, when the deployment has no accounts", async () => {
    const fetcher = vi.fn();
    await expect(pingAccounts(null, fetcher)).resolves.toBe("notConfigured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
