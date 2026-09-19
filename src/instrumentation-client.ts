import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { sentryOptions } from "@/services/telemetry/sentry-options";

// Browser error tracking, sent through the /monitoring tunnel. No Session Replay:
// only scrubbed errors and a sample of page timings leave the browser.

// The CSP forbids eval. Zod probes for it (new Function) before compiling a schema, and the probe
// alone is reported as a violation even though zod falls back; jitless skips it.
z.config({ jitless: true });

Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
