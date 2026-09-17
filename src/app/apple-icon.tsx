import { ImageResponse } from "next/og";
import { DARK } from "@/components/brand/brand-colors";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Flexbox-only drawing: Satori reads no CSS variables and no external SVG.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: DARK.surface0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 84, borderRadius: 8, background: DARK.keyRed, display: "flex" }} />
          <div style={{ width: 26, height: 84, borderRadius: 8, background: DARK.keyOrange, display: "flex" }} />
          <div style={{ width: 26, height: 84, borderRadius: 8, background: DARK.keyYellow, display: "flex" }} />
          <div style={{ width: 12, height: 12, borderRadius: 12, background: DARK.keyRed, display: "flex" }} />
        </div>
      </div>
    ),
    size,
  );
}
