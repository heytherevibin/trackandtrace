import { describe, expect, it } from "vitest";
import { consoleAvailability } from "@/console/availability";

// Previews and localhost share the production Supabase project, so the console must refuse to act on it there.
describe("consoleAvailability", () => {
  it("runs in production", () => {
    expect(consoleAvailability({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("available");
  });

  it("refuses previews", () => {
    expect(consoleAvailability({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("production-only");
  });

  it("runs locally against a local database, or none", () => {
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe("available");
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe("available");
    expect(consoleAvailability({})).toBe("available");
  });

  it("refuses a local server pointed at a hosted project", () => {
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("local-database-needed");
    expect(consoleAvailability({ VERCEL_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("local-database-needed");
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toBe("local-database-needed");
  });
});
