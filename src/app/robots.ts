import type { MetadataRoute } from "next";

// The PNR result page is never indexed (its PNR lives after "#", which crawlers never see).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/pnr", "/api/", "/auth/"] }] };
}
