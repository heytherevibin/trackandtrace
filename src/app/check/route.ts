import { NextResponse, type NextRequest } from "next/server";
import { isValidPnr, normalizePnr, pnrHref } from "@/utils/pnr";

// Progressive enhancement: before React hydrates, the check form posts here natively. A valid PNR
// redirects to its result with the PNR after "#" (never in a path or query string, which request
// logs record); anything else returns home.

function redirectFor(raw: string, origin: string): NextResponse {
  const digits = normalizePnr(raw);
  const target = isValidPnr(digits) ? pnrHref(digits) : "/";
  return NextResponse.redirect(new URL(target, origin), 303);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw = "";
  try {
    const value = (await req.formData()).get("pnr");
    raw = typeof value === "string" ? value : "";
  } catch {
    raw = "";
  }
  return redirectFor(raw, req.nextUrl.origin);
}

/** Old GET submissions (a page cached before the form posted) still land on the result. */
export function GET(req: NextRequest): NextResponse {
  return redirectFor(req.nextUrl.searchParams.get("pnr") ?? "", req.nextUrl.origin);
}
