import { afterEach, describe, expect, it, vi } from "vitest";

// Typed as a variadic function, not inferred from the zero-arg lambda: the assertions below
// inspect the real call's third argument, so `.mock.calls[0]` must be `unknown[]`, not `[]`.
const createServerClient = vi.fn<(...args: unknown[]) => { tag: string }>(() => ({ tag: "server" }));
const createClient = vi.fn<(...args: unknown[]) => { tag: string }>(() => ({ tag: "service" }));
const cookieStore = { getAll: () => [], set: vi.fn() };

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

async function load() {
  vi.resetModules();
  return import("@/console/auth/db");
}

const CONFIGURED = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_aaaaaaaaaaaaaaaaaaaaaa",
  SUPABASE_SECRET_KEY: "sb_secret_aaaaaaaaaaaaaaaaaaaaaaaa",
};

afterEach(() => {
  vi.unstubAllEnvs();
  createServerClient.mockClear();
  createClient.mockClear();
});

describe("the console's Supabase clients", () => {
  it("names the console's own cookie, so a traveller token is never read as a console one", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    const { createConsoleDb, CONSOLE_COOKIE_NAME } = await load();
    await createConsoleDb();
    expect(CONSOLE_COOKIE_NAME).toBe("sb-console-auth-token");
    expect(createServerClient.mock.calls[0]?.[2]).toMatchObject({ cookieOptions: { name: "sb-console-auth-token" } });
  });

  it("refuses to build a member client when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { createConsoleDb } = await load();
    await expect(createConsoleDb()).rejects.toMatchObject({ code: "CONSOLE_UNAVAILABLE", status: 503 });
  });

  it("refuses to build a service client without the secret key", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const { createConsoleServiceDb } = await load();
    expect(() => createConsoleServiceDb()).toThrow(expect.objectContaining({ code: "CONSOLE_UNAVAILABLE" }));
  });

  it("keeps the service client out of the browser", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    vi.stubGlobal("window", {});
    const { createConsoleServiceDb } = await load();
    expect(() => createConsoleServiceDb()).toThrow(/never run in the browser/);
    vi.unstubAllGlobals();
  });

  it("gives the service client no session of its own", async () => {
    for (const [name, value] of Object.entries(CONFIGURED)) vi.stubEnv(name, value);
    const { createConsoleServiceDb } = await load();
    createConsoleServiceDb();
    expect(createClient.mock.calls[0]?.[2]).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
  });
});
