import type { MetadataRoute } from "next";
import { NEUBRUTAL_LIGHT } from "@/components/brand/brand-colors";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trakline",
    short_name: "Trakline",
    description: "Check an Indian Railways PNR and read exactly what the source returned.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: NEUBRUTAL_LIGHT.bg,
    theme_color: NEUBRUTAL_LIGHT.bg,
    categories: ["travel", "utilities"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
