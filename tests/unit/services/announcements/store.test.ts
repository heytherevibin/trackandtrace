import { beforeEach, describe, expect, it, vi } from "vitest";

// Typed wide: inferred from the default it would be `{ data: null; error: null }`, and every
// `mockResolvedValueOnce` below would fail to compile.
const rpc = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }));
vi.mock("@/services/supabase/admin", () => ({ createAdminSupabase: () => ({ rpc }) }));

import {
  claimDeliveries,
  markDelivery,
  queueLetter,
  recordWebhook,
  stopLetter,
  suppressionFor,
} from "@/services/announcements/store";
import { AppError } from "@/services/errors";

describe("the announcements store", () => {
  it("claims through announce_claim with the limit it was given", async () => {
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", email: "a@example.in" }], error: null });
    expect(await claimDeliveries("L", 7)).toEqual([{ personId: "p1", email: "a@example.in" }]);
    expect(rpc).toHaveBeenCalledWith("announce_claim", { p_letter: "L", p_limit: 7 });
  });

  it("marks one delivery with the provider's id", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await markDelivery("L", "p1", "sent", "resend-id");
    expect(rpc).toHaveBeenCalledWith("announce_mark", { p_letter: "L", p_person: "p1", p_state: "sent", p_provider_id: "resend-id" });
  });

  it("reads a suppression, and treats an unknown answer as no suppression rather than guessing", async () => {
    rpc.mockResolvedValueOnce({ data: "list", error: null });
    expect(await suppressionFor("a@example.in")).toBe("list");
    rpc.mockResolvedValueOnce({ data: "nonsense", error: null });
    expect(await suppressionFor("a@example.in")).toBe(null);
  });

  it("throws when the database errors, so a caller cannot mistake a failure for an empty result", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(claimDeliveries("L", 1)).rejects.toThrow();
  });
});

describe("the announcements store, beyond the claim", () => {
  beforeEach(() => rpc.mockClear());

  it("queues through announce_queue and returns how many deliveries it made", async () => {
    rpc.mockResolvedValueOnce({ data: 42, error: null });
    expect(await queueLetter("L")).toBe(42);
    expect(rpc).toHaveBeenCalledWith("announce_queue", { p_letter: "L" });
  });

  it("stops through announce_stop", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await stopLetter("L");
    expect(rpc).toHaveBeenCalledWith("announce_stop", { p_letter: "L" });
  });

  it("asks announce_suppressed about the address it was given", async () => {
    rpc.mockResolvedValueOnce({ data: "all", error: null });
    expect(await suppressionFor("a@example.in")).toBe("all");
    expect(rpc).toHaveBeenCalledWith("announce_suppressed", { p_email: "a@example.in" });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await suppressionFor("b@example.in")).toBe(null);
  });

  it("records a webhook through announce_webhook and passes back the verdict", async () => {
    rpc.mockResolvedValueOnce({ data: "recorded", error: null });
    expect(await recordWebhook("msg_1", "email.bounced", "a@example.in", "2026-10-02T00:00:00Z")).toBe("recorded");
    expect(rpc).toHaveBeenCalledWith("announce_webhook", {
      p_svix_id: "msg_1",
      p_kind: "email.bounced",
      p_email: "a@example.in",
      p_at: "2026-10-02T00:00:00Z",
    });
    rpc.mockResolvedValueOnce({ data: "duplicate", error: null });
    expect(await recordWebhook("msg_1", "email.bounced", "a@example.in", "2026-10-02T00:00:00Z")).toBe("duplicate");
  });

  it("marks a delivery with no provider id when there is none", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await markDelivery("L", "p1", "skipped", null);
    expect(rpc).toHaveBeenCalledWith("announce_mark", { p_letter: "L", p_person: "p1", p_state: "skipped", p_provider_id: null });
  });

  it("returns an empty claim as an empty list, which is how a finished letter looks", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await claimDeliveries("L", 5)).toEqual([]);
  });

  // The error path, once per wrapper. Each of these must throw: a store that answers "nothing to do"
  // when the database is unreachable turns an outage into a silent no-op, and the send loop above it
  // would report a clean run having sent nothing.
  const down = { data: null, error: { message: "boom" } };
  it.each([
    ["queueLetter", () => queueLetter("L")],
    ["claimDeliveries", () => claimDeliveries("L", 1)],
    ["markDelivery", () => markDelivery("L", "p1", "sent", "id")],
    ["stopLetter", () => stopLetter("L")],
    ["suppressionFor", () => suppressionFor("a@example.in")],
    ["recordWebhook", () => recordWebhook("m", "email.bounced", "a@example.in", "2026-10-02T00:00:00Z")],
  ])("%s throws when the database errors", async (_name, run) => {
    rpc.mockResolvedValueOnce(down);
    await expect(run()).rejects.toBeInstanceOf(AppError);
  });

  it("does not put the address, the person or the database's own message in the error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "duplicate key a@example.in" } });
    const err = await suppressionFor("a@example.in").catch((e: unknown) => e);
    expect(String((err as Error).message)).not.toMatch(/example\.in|duplicate key/);
  });

  it("throws on a claim that is not a list, or holds a row it cannot read, rather than dropping recipients", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(claimDeliveries("L", 1)).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", email: "a@example.in" }, { personId: "p2" }], error: null });
    await expect(claimDeliveries("L", 2)).rejects.toThrow();
  });

  // Each field is checked on its own: a validator that looked at only one would pass the others.
  const good = { personId: "p1", email: "a@example.in" };
  it.each([
    ["a row with no email", { personId: "p2" }],
    ["a row with no personId", { email: "b@example.in" }],
    ["a non-string email", { personId: "p2", email: 42 }],
    ["a non-string personId", { personId: 42, email: "b@example.in" }],
    ["an empty email, which is a send to nothing", { personId: "p2", email: "" }],
    ["an empty personId", { personId: "", email: "b@example.in" }],
    ["a null row", null],
  ])("rejects the whole claim when it holds %s", async (_name, bad) => {
    rpc.mockResolvedValueOnce({ data: [good, bad], error: null });
    await expect(claimDeliveries("L", 2)).rejects.toBeInstanceOf(AppError);
  });

  it("answers null to a suppression that is not a string at all, not only to a wrong string", async () => {
    rpc.mockResolvedValueOnce({ data: 42, error: null });
    expect(await suppressionFor("a@example.in")).toBe(null);
  });

  it("throws on a queue count or a webhook verdict it does not recognise", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(queueLetter("L")).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: "whatever", error: null });
    await expect(recordWebhook("m", "k", "a@example.in", "2026-10-02T00:00:00Z")).rejects.toThrow();
  });
});
