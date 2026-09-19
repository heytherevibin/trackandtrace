import { AppError } from "@/services/errors";

/**
 * Console route handlers accept requests only from console pages.
 * - Browsers mark those `Sec-Fetch-Site: same-origin`. trakline.in is same-site with the console but not
 *   same-origin, so its pages are refused.
 * - A request without that header must carry an Origin matching the host.
 */
export function assertSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin") return;
  if (site === null) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host") ?? new URL(req.url).host;
    try {
      if (origin && new URL(origin).host === host) return;
    } catch {
      // An unreadable Origin is refused below.
    }
  }
  throw new AppError("INVALID_INPUT", "Cross-site requests are refused.", { status: 403 });
}
