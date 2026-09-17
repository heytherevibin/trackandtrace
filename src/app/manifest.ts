import type { MetadataRoute } from "next";
import { LIGHT } from "@/components/brand/brand-colors";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Track & Trace",
    short_name: "Track & Trace",
    description: "Check an Indian Railways PNR and read exactly what the source returned.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: LIGHT.surface0,
    theme_color: LIGHT.surface0,
    categories: ["travel", "utilities"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
