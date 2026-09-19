import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
})();

const dev = process.env.NODE_ENV !== "production";

/** Sentry's CSP report endpoint, from the public DSN. Production only: previews carry the Vercel toolbar. */
const cspReportUri = (() => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || process.env.VERCEL_ENV !== "production") return null;
  try {
    const url = new URL(dsn);
    return `${url.protocol}//${url.host}/api${url.pathname}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
})();

// Enforced. Scripts keep 'unsafe-inline': Next 16 per-request nonces would force dynamic rendering
// (the console host gets a nonce policy from src/proxy.ts). tests/e2e/csp.spec.ts fails on any violation, on every route.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace("http", "ws")}` : ""}${dev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Outside development only: it would push http://localhost to https.
  ...(dev ? [] : ["upgrade-insecure-requests"]),
  ...(cspReportUri ? [`report-uri ${cspReportUri}`] : []),
].join("; ");

// The site has one address. www answers with a permanent redirect there, path and query kept.
const CANONICAL_HOST = "trakline.in";

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.googleusercontent.com" }],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${CANONICAL_HOST}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];
  },
  async headers() {
    // Constants, as the proxy's matcher: the console host in production, and admin.localhost everywhere else.
    const consoleHost = { type: "host" as const, value: "(?:admin\\.trakline\\.in|admin\\.localhost)" };
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        source: "/:path*",
        missing: [consoleHost],
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // The console's nonce policy is set per request by src/proxy.ts; nothing here may send a second one.
        source: "/:path*",
        has: [consoleHost],
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)" },
        ],
      },
    ];
  },
};

// Error reports travel through /monitoring (same origin: the CSP keeps connect-src 'self' and
// ad-blockers don't drop them). Source maps upload only when the Sentry integration's token is
// present, and are deleted from the output afterwards, so they never ship publicly.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  webpack: { treeshake: { removeDebugLogging: true } },
});
