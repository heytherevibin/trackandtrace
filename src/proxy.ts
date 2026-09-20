import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { consoleCsp, newNonce, sentryReportUri } from "@/console/csp";
import { CONSOLE_HOST_LOCAL, CONSOLE_HOST_PRODUCTION, isConsoleHost, requestHost } from "@/console/hosts";
import { env } from "@/services/env";
import { isSupabaseConfigured, supabasePublicEnv } from "@/services/supabase/public-env";
import type { Database } from "@/types/supabase";

// One app, two hosts.
// - The console host rewrites every page into /console, with a fresh nonce policy.
// - Every other host answers 404 to /console, and refreshes an expiring Supabase session on page requests, as
//   before. Route handlers under /api make their own client.

const CONSOLE_PREFIX = "/console";
const ROBOTS_CLOSED = "User-agent: *\nDisallow: /\n";

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function isConsolePath(pathname: string): boolean {
  return pathname === CONSOLE_PREFIX || pathname.startsWith(`${CONSOLE_PREFIX}/`);
}

function supabaseOrigin(): string | null {
  try {
    return supabasePublicEnv.url ? new URL(supabasePublicEnv.url).origin : null;
  } catch {
    return null;
  }
}

function consoleRequest(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isConsolePath(pathname)) return notFound();
  if (pathname === "/robots.txt") return new NextResponse(ROBOTS_CLOSED, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") return notFound();

  const current = env();
  const nonce = newNonce();
  const policy = consoleCsp({
    nonce,
    dev: current.NODE_ENV === "development",
    supabaseOrigin: supabaseOrigin(),
    reportUri: sentryReportUri(process.env.NEXT_PUBLIC_SENTRY_DSN, current.VERCEL_ENV),
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);

  const destination = request.nextUrl.clone();
  destination.pathname = pathname === "/" ? CONSOLE_PREFIX : `${CONSOLE_PREFIX}${pathname}`;
  const response = NextResponse.rewrite(destination, { request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(supabasePublicEnv.url, supabasePublicEnv.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // No logic between client creation and this call: it performs the refresh.
  await supabase.auth.getClaims();
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get("host");
  if (isConsoleHost(host, env().VERCEL_ENV)) return consoleRequest(request);
  // A host that names a console constant for the *other* environment must fail closed, never
  // fall through to the traveller branch: the matcher's static host pattern lists both constants,
  // since it cannot know at build time which one this deployment answers to (see hosts.ts).
  const parsedHost = requestHost(host);
  if (parsedHost === CONSOLE_HOST_PRODUCTION || parsedHost === CONSOLE_HOST_LOCAL) return notFound();
  if (isConsolePath(request.nextUrl.pathname)) return notFound();
  return refreshSession(request);
}

// Literals only: Next reads the matcher statically. Next anchors the host pattern; the dots in it are escaped by hand below.
export const config = {
  matcher: [
    {
      source: "/((?!api/|monitoring|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
      missing: [{ type: "host", value: "(?:admin\\.trakline\\.in|admin\\.localhost)" }],
    },
    {
      source: "/((?!_next/|__nextjs|monitoring|favicon\\.ico|icon\\.svg|apple-icon|brand/).*)",
      has: [{ type: "host", value: "(?:admin\\.trakline\\.in|admin\\.localhost)" }],
    },
    "/console/:path*",
  ],
};
