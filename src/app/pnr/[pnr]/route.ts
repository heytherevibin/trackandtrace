import { NextResponse, type NextRequest } from "next/server";
import { isValidPnr, pnrHref } from "@/utils/pnr";

// Links from before result pages moved the PNR after "#": one permanent redirect to the hash form.
// Nothing links here any more; a request to this path is the only way a PNR still reaches a log.
export async function GET(req: NextRequest, ctx: { params: Promise<{ pnr: string }> }): Promise<NextResponse> {
  const { pnr } = await ctx.params;
  const target = isValidPnr(pnr) ? pnrHref(pnr) : "/pnr";
  return NextResponse.redirect(new URL(target, req.nextUrl.origin), 308);
}
