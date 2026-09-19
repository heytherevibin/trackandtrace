import type { Breadcrumb, Event } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

// One set of Sentry options for the server, the edge and the browser. Without a DSN
// (local runs, CI, end-to-end tests) Sentry stays off.

type EnvSource = Readonly<Record<string, string | undefined>>;

export interface SentryOptions {
  readonly dsn: string | undefined;
  readonly enabled: boolean;
  readonly environment: string;
  readonly sendDefaultPii: false;
  readonly tracesSampleRate: number;
  /** Generic, so one scrubber serves errors and transactions alike. */
  readonly beforeSend: <T extends Event>(event: T) => T;
  readonly beforeSendTransaction: <T extends Event>(event: T) => T;
  readonly beforeBreadcrumb: (breadcrumb: Breadcrumb) => Breadcrumb;
}

/** Read by name: the browser build inlines only literal process.env.NEXT_PUBLIC_* reads. */
function runtimeEnv(): EnvSource {
  return {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export function sentryOptions(source: EnvSource = runtimeEnv()): SentryOptions {
  const dsn = source.NEXT_PUBLIC_SENTRY_DSN || undefined;
  const environment = source.NEXT_PUBLIC_VERCEL_ENV || source.VERCEL_ENV || "development";
  return {
    dsn,
    enabled: dsn !== undefined,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: environment === "production" ? 0.05 : 1,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}
