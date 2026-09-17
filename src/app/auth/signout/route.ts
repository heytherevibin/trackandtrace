import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/services/supabase/server";

/** POST /auth/signout — clears the session cookie and returns home. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const db = await createServerSupabase();
  if (db) await db.auth.signOut();
  return NextResponse.redirect(new URL("/", req.nextUrl.origin), 303);
}
