import { ImageResponse } from "next/og";
import { MARK } from "@/components/brand/brand-colors";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Flexbox-only drawing of the mark: Satori reads no CSS variables and no external SVG.
export default function AppleIcon() {
  return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: MARK.plate }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 90, borderRadius: 8, background: MARK.keyOne, display: "flex" }} />
            <div style={{ width: 28, height: 90, borderRadius: 8, background: MARK.keyTwo, display: "flex" }} />
            <div style={{ width: 28, height: 90, borderRadius: 8, background: MARK.keyThree, display: "flex" }} />
            <div style={{ width: 14, height: 14, borderRadius: 14, background: MARK.lamp, display: "flex" }} />
          </div>
        </div>
      ),
    size,
  );
}
