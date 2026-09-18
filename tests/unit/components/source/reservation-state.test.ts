import { describe, expect, it } from "vitest";
import { reservationStateFor } from "@/components/source/source-status-table";
import { parseEnv, type Env } from "@/services/env";

const RAILKIT_KEY = "railkit_0123456789abcdef0123456789abcdef";
const RAPIDAPI_KEY = "test-key-0123456789abcdef";

function envOf(source: Record<string, string>): Env {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.env;
}

describe("reservationStateFor", () => {
  it("names the third-party source that answers, and its fallback", () => {
    expect(reservationStateFor(envOf({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: RAILKIT_KEY }))).toBe("Connected · RailKit (third-party)");
    expect(
      reservationStateFor(envOf({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: RAILKIT_KEY, PNR_FALLBACK: "rapidapi", RAPIDAPI_KEY })),
    ).toBe("Connected · RailKit (third-party) · RapidAPI as fallback");
    expect(reservationStateFor(envOf({ NODE_ENV: "production", PNR_SOURCE: "rapidapi", RAPIDAPI_KEY }))).toBe("Connected · RapidAPI (third-party)");
  });

  it("says sample data for the fixture and not connected for the empty seam", () => {
    expect(reservationStateFor(envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" }))).toBe("Sample data (development)");
    expect(reservationStateFor(envOf({ NODE_ENV: "production" }))).toBe("Not connected");
  });
});
