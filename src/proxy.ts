import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabasePublicEnv } from "@/services/supabase/public-env";
import type { Database } from "@/types/supabase";

// Refreshes an expiring Supabase session on page requests so server components
// always read a valid cookie. Route handlers under /api create their own client.

export async function proxy(request: NextRequest): Promise<NextResponse> {
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

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
