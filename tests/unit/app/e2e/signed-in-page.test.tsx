import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /e2e/signed-in draws the account view and menu with a fixture traveller for the nightly's 200% sweep. It exists only
// on Playwright's own server: E2E=1 and no accounts configured. Anywhere else it is a 404, and it reaches no real auth
// and no real data.

const state = vi.hoisted(() => ({ e2e: true, supabase: false }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/services/env", () => ({ env: () => ({ E2E: state.e2e }) }));
vi.mock("@/services/supabase/public-env", () => ({ isSupabaseConfigured: () => state.supabase }));

const { default: SignedInFixturePage, metadata } = await import("@/app/(site)/e2e/signed-in/page");

const SOURCE = readFileSync(join(process.cwd(), "src/app/(site)/e2e/signed-in/page.tsx"), "utf8");

async function status(): Promise<number> {
  try {
    await SignedInFixturePage();
    return 200;
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.endsWith(";404")) return 404;
    throw err;
  }
}

describe("/e2e/signed-in", () => {
  beforeEach(() => {
    state.e2e = true;
    state.supabase = false;
  });

  it("is a 404 without E2E=1", async () => {
    state.e2e = false;
    expect(await status()).toBe(404);
  });

  it("is a 404 wherever accounts are configured, so its Sign out and Export can never reach a real account", async () => {
    state.supabase = true;
    expect(await status()).toBe(404);
  });

  it("draws only on Playwright's own server: E2E=1 and no accounts", async () => {
    expect(await status()).toBe(200);
  });

  it("asks never to be indexed or followed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("reads no session, no store and no account: its traveller is a constant", () => {
    for (const source of ["@/services/session", "@/services/supabase/server", "@/services/watchlist-repo", "@/services/auth-client", "fetch("]) {
      expect(SOURCE, source).not.toContain(source);
    }
  });
});
