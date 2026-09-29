import type { MetadataRoute } from "next";

// The PNR result page is never indexed (its PNR lives after "#", which crawlers never see), nor the end-to-end run's
// fixture pages under /e2e/ (a 404 outside Playwright's own server).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/pnr", "/api/", "/auth/", "/e2e/"] }] };
}
