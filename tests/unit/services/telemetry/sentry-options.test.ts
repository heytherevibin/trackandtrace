import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { sentryOptions } from "@/services/telemetry/sentry-options";

const DSN = "https://public@o0.ingest.sentry.io/0";

describe("sentryOptions", () => {
  it("is off without a DSN: local runs, CI and end-to-end tests report nothing", () => {
    expect(sentryOptions({})).toMatchObject({ enabled: false, dsn: undefined });
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: "" })).toMatchObject({ enabled: false });
  });

  it("is on with a DSN", () => {
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN })).toMatchObject({ enabled: true, dsn: DSN });
  });

  it("names the Vercel environment, and samples 5% of traces in production", () => {
    expect(sentryOptions({ NEXT_PUBLIC_VERCEL_ENV: "production" })).toMatchObject({ environment: "production", tracesSampleRate: 0.05 });
    expect(sentryOptions({ VERCEL_ENV: "preview" })).toMatchObject({ environment: "preview", tracesSampleRate: 1 });
    expect(sentryOptions({})).toMatchObject({ environment: "development", tracesSampleRate: 1 });
  });

  it("never sends personal data by default, and scrubs everything it does send", () => {
    const options = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: DSN });
    expect(options.sendDefaultPii).toBe(false);
    const event: ErrorEvent = { type: undefined, message: "no record for 2345678901" };
    expect(options.beforeSend(event).message).toBe("no record for 23••••••01");
    expect(options.beforeBreadcrumb({ message: "2345678901" }).message).toBe("23••••••01");
  });
});
