import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// `unsubscribeKey()` is the DERIVATION, and nothing else proved it.
//
// Every other test of unsubscribe links signs and verifies with the same key handed in by the test,
// so the composing side and the verifying side agree whatever the key is — including if it were a
// per-process random one. That is exactly the shape that fails in production and nowhere else: the
// script that mails the link and the route that verifies it are DIFFERENT PROCESSES, so two
// per-process keys never match, and every unsubscribe link in every inbox answers "that link did not
// work". With `DATA_KEY` set it must be HKDF's `unsubscribe` subkey of that key, and nothing else.
// ---------------------------------------------------------------------------

const key = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("@/services/env", () => ({ env: () => ({ DATA_KEY: key.value }) }));

import { deriveDataKeys } from "@/services/data-key";
import { signUnsubscribe, unsubscribeKey, verifyUnsubscribe } from "@/services/subscriptions/links";

const DATA_KEY = Buffer.alloc(32, 3).toString("base64");
const OTHER = Buffer.alloc(32, 4).toString("base64");
const PERSON = "8a1f2c3d-0000-4000-8000-000000000001";

describe("unsubscribeKey", () => {
  it("is DATA_KEY's `unsubscribe` subkey, byte for byte", () => {
    key.value = DATA_KEY;
    expect(unsubscribeKey().equals(deriveDataKeys(DATA_KEY).unsubscribe)).toBe(true);
  });

  it("is NOT any of DATA_KEY's other subkeys, so one leaked subkey is not all of them", () => {
    key.value = DATA_KEY;
    const keys = deriveDataKeys(DATA_KEY);
    const mine = unsubscribeKey();
    for (const other of [keys.cacheName, keys.cacheValue, keys.clientId]) expect(mine.equals(other)).toBe(false);
  });

  it("follows DATA_KEY: a rotation invalidates every link already in an inbox, which is the documented cost", () => {
    key.value = DATA_KEY;
    const before = signUnsubscribe(unsubscribeKey(), PERSON, "news");
    key.value = OTHER;
    expect(verifyUnsubscribe(unsubscribeKey(), PERSON, "news", before)).toBe(false);
    expect(unsubscribeKey().equals(deriveDataKeys(OTHER).unsubscribe)).toBe(true);
  });

  it("is the same key on every call, so a link signed by one request verifies in the next", () => {
    key.value = DATA_KEY;
    expect(unsubscribeKey().equals(unsubscribeKey())).toBe(true);
  });

  it("falls back to a key of its own only when DATA_KEY is absent, and that key is no derivation of any DATA_KEY", () => {
    // Local only — the environment check requires DATA_KEY in production. The fallback must never be
    // mistaken for a working key: links signed with it work inside one dev server and nowhere else,
    // which is why nothing above may depend on it.
    key.value = undefined;
    const local = unsubscribeKey();
    expect(local).toHaveLength(32);
    expect(local.equals(deriveDataKeys(DATA_KEY).unsubscribe)).toBe(false);
    expect(local.equals(deriveDataKeys(OTHER).unsubscribe)).toBe(false);
  });
});
