import { ImageResponse } from "next/og";
import { LIGHT } from "@/components/brand/brand-colors";

export const alt = "Track & Trace — PNR status from the source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GROUPS = [3, 3, 4] as const;
const GROUP_LABELS = ["1–3", "4–6", "7–10"] as const;

function Corner({ top, left }: { readonly top: boolean; readonly left: boolean }) {
  const pos = { position: "absolute" as const, width: 22, height: 22, display: "flex", ...(top ? { top: -11 } : { bottom: -11 }), ...(left ? { left: -11 } : { right: -11 }) };
  return (
    <div style={pos}>
      <div style={{ position: "absolute", left: 10, top: 0, width: 2, height: 22, background: LIGHT.ink3, display: "flex" }} />
      <div style={{ position: "absolute", top: 10, left: 0, width: 22, height: 2, background: LIGHT.ink3, display: "flex" }} />
    </div>
  );
}

// Satori draws flexbox only and reads no CSS variables: literal brand colours, a drawn plate.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: LIGHT.surface0, padding: 64, color: LIGHT.ink1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: LIGHT.accentText }}>TRACK &amp; TRACE</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.04, letterSpacing: 1, maxWidth: 980 }}>YOUR PNR, AS THE RAILWAY RECORDS IT.</div>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", border: `2px solid ${LIGHT.line}` }}>
          <Corner top left />
          <Corner top left={false} />
          <Corner top={false} left />
          <Corner top={false} left={false} />
          <div style={{ display: "flex", borderBottom: `2px solid ${LIGHT.line}`, fontSize: 22, letterSpacing: 3 }}>
            <div style={{ display: "flex", flex: 1, padding: "14px 24px" }}>PNR CHECK — LIVE REQUEST</div>
            <div style={{ display: "flex", padding: "14px 24px", borderLeft: `2px solid ${LIGHT.line}`, color: LIGHT.ink3 }}>FORM T&amp;T-01</div>
          </div>
          <div style={{ display: "flex", gap: 28, padding: 24 }}>
            {GROUPS.map((count, gi) => (
              <div key={gi} style={{ display: "flex", flexDirection: "column", flex: count, gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {Array.from({ length: count }, (_, i) => (
                    <div key={i} style={{ display: "flex", flex: 1, height: 84, border: `2px solid ${LIGHT.line}` }} />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "center", fontSize: 18, color: LIGHT.ink3, letterSpacing: 2 }}>{GROUP_LABELS[gi]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
