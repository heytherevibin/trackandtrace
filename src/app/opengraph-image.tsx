import { ImageResponse } from "next/og";
import { DARK } from "@/components/brand/brand-colors";

export const alt = "Track & Trace — PNR status from the source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const KEY_COLOURS = [DARK.keyRed, DARK.keyRed, DARK.keyRed, DARK.keyOrange, DARK.keyOrange, DARK.keyOrange, DARK.keyYellow, DARK.keyYellow, DARK.keyYellow, DARK.keyYellow];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: DARK.surface0, padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 30, color: "#9a9a9f", letterSpacing: 6 }}>TRACK &amp; TRACE</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: DARK.ink1, lineHeight: 1.1, maxWidth: 900 }}>
            Check your PNR. Read what the railway returned.
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#9a9a9f" }}>Free · no account · every field labelled with its source</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {KEY_COLOURS.map((colour, i) => (
            <div key={i} style={{ width: 84, height: 120, borderRadius: 10, background: colour, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 26, height: 12, borderRadius: 4, background: DARK.readoutBg, display: "flex" }} />
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
