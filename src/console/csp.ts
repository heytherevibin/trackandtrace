import { createHash } from "node:crypto";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-boot";

// The console's policy, set per request by the proxy.
// - Scripts run only with this request's nonce, plus what those scripts load ('strict-dynamic'), and the one
//   hashed boot script that global-error.tsx inlines.
// - Styles keep 'unsafe-inline': a nonce can't cover a style attribute, and the toast library injects a <style>
//   without one.

export interface ConsoleCspOptions {
  readonly nonce: string;
  readonly dev: boolean;
  readonly supabaseOrigin: string | null;
  readonly reportUri: string | null;
}

export const THEME_BOOT_HASH = `'sha256-${createHash("sha256").update(THEME_BOOT_SCRIPT).digest("base64")}'`;

/** A fresh, unguessable nonce for each request. */
export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/** Sentry's CSP report endpoint, from the public DSN. Production only, as on the traveller site. */
export function sentryReportUri(dsn: string | undefined, vercelEnv: string | undefined): string | null {
  if (!dsn || vercelEnv !== "production") return null;
  try {
    const url = new URL(dsn);
    return `${url.protocol}//${url.host}/api${url.pathname}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
}

export function consoleCsp({ nonce, dev, supabaseOrigin, reportUri }: ConsoleCspOptions): string {
  const supabase = supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace("http", "ws")}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_BOOT_HASH}${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase}${dev ? " ws:" : ""}`,
    "worker-src 'none'",
    "manifest-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
    ...(reportUri ? [`report-uri ${reportUri}`] : []),
  ].join("; ");
}
