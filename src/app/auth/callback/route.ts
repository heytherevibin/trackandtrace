import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/services/supabase/server";

const DEFAULT_NEXT = "/account";
const EMAIL_OTP_TYPES = new Set(["magiclink", "email", "signup", "recovery", "invite", "email_change"]);

/** Only same-origin absolute paths may be used as a post-login destination. */
export function safeNextPath(input: string | null): string {
  if (!input) return DEFAULT_NEXT;
  if (!input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\") || input.includes("://")) return DEFAULT_NEXT;
  return input;
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
}

/** Completes Google OAuth (PKCE `code`) or an email link (`token_hash` + `type`). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  const db = await createServerSupabase();
  if (!db) return redirectTo(req, "/login?error=unavailable");

  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(req, next);
  } else if (tokenHash && type && EMAIL_OTP_TYPES.has(type)) {
    const { error } = await db.auth.verifyOtp({ type: type as "magiclink", token_hash: tokenHash });
    if (!error) return redirectTo(req, next);
  }
  return redirectTo(req, "/login?error=link");
}
