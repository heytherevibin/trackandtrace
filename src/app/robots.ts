import type { MetadataRoute } from "next";

// PNR result pages are keyed by the ticket number: never indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/pnr/", "/api/", "/auth/"] }] };
}
