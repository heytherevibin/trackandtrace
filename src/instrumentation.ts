import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/services/telemetry/sentry-options";

// Server and edge error tracking. Every event passes the scrubber in sentryOptions.

export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") Sentry.init(sentryOptions());
}

export const onRequestError = Sentry.captureRequestError;
