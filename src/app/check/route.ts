import { NextResponse, type NextRequest } from "next/server";
import { isValidPnr, normalizePnr } from "@/utils/pnr";

// Progressive enhancement: before React hydrates, the check form submits here
// natively. A valid PNR redirects to its result; anything else returns home.
export function GET(req: NextRequest): NextResponse {
  const digits = normalizePnr(req.nextUrl.searchParams.get("pnr") ?? "");
  const target = isValidPnr(digits) ? `/pnr/${digits}` : "/";
  return NextResponse.redirect(new URL(target, req.nextUrl.origin), 303);
}
