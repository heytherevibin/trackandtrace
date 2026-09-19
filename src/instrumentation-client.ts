import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/services/telemetry/sentry-options";

// Browser error tracking, sent through the /monitoring tunnel. No Session Replay:
// only scrubbed errors and a sample of page timings leave the browser.

Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
