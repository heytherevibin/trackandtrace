// The spec signs an unsubscribe link with the key the SERVER derives, so both must hold the same
// DATA_KEY: the fixed test key `tests/unit/services/shared-store.test.ts` already uses, set on the
// server by playwright.console.config.ts's webServer env. Not a secret, and never a real one.
//
// Assigned in the module body rather than at first use: ESM evaluates every import before this
// line, but nothing imported here reads `env()` while its module loads — `unsubscribeKey()` reads
// it when the test calls it, by which time this has run.
process.env.DATA_KEY ??= Buffer.alloc(32, 7).toString("base64");

import { messages } from "@/messages";
import { signUnsubscribe, unsubscribeKey } from "@/services/subscriptions/links";
import { consoleSql, expect, test } from "./fixtures";

const BASE = "http://admin.localhost:4211";
/** The routes are the traveller host's; this config's baseURL is the console's. */
const traveller = (base: string) => base.replace("admin.localhost", "localhost");
const HEADERS = { "content-type": "application/json", "x-forwarded-for": "198.51.100.90" };

/**
 * Sign up, confirm once, stay quiet, unsubscribe: the whole backend, through the real routes and the
 * real database. Everything below this line has been proved in isolation; what this adds is that the
 * pieces fit — the token that reaches the inbox is the one the database will accept, and `bytea`
 * survives the trip through PostgREST.
 */
test("a sign-up is confirmed once, a repeat is quiet, and the signed link unsubscribes", async ({ request, baseURL }) => {
  const base = baseURL ?? BASE;
  const email = `sub-${Date.now()}@example.in`;
  try {
    const first = await request.post(`${traveller(base)}/api/subscribe`, { headers: HEADERS, data: { email, list: "news", source: "footer" } });
    expect(await first.json()).toEqual({ ok: true, message: messages.subscribe.sent });

    const letters = (await (await request.get(`${base}/api/test-outbox?to=${encodeURIComponent(email)}`)).json()).letters as { text: string }[];
    expect(letters).toHaveLength(1);
    const token = /subscribe\/confirm\?token=([A-Za-z0-9_-]{43})/.exec(letters[0]!.text)?.[1];
    expect(token).toBeDefined();

    const confirmed = await request.post(`${traveller(base)}/api/subscribe/confirm`, { headers: HEADERS, data: { token } });
    expect(await confirmed.json()).toEqual({ ok: true, state: "confirmed", list: "news" });
    expect(consoleSql(`select c.confirmed_at is not null from subscriptions.consents c join subscriptions.people p on p.id = c.person_id where p.email = '${email}'`)).toBe("t");

    await request.post(`${traveller(base)}/api/subscribe`, { headers: HEADERS, data: { email, list: "news", source: "footer" } });
    const again = (await (await request.get(`${base}/api/test-outbox?to=${encodeURIComponent(email)}`)).json()).letters;
    expect(again, "already subscribed: no second email").toHaveLength(0);

    const person = consoleSql(`select id from subscriptions.people where email = '${email}'`);
    const out = await request.post(`${traveller(base)}/api/unsubscribe`, {
      headers: HEADERS,
      data: { p: person, l: "news", s: signUnsubscribe(unsubscribeKey(), person, "news"), action: "unsubscribe" },
    });
    expect(await out.json()).toEqual({ ok: true, state: "done" });
  } finally {
    // The address is minted per run, so this removes only this run's rows — and cascades to its
    // consent and its tokens.
    consoleSql(`delete from subscriptions.people where email = '${email}'`);
  }
});
