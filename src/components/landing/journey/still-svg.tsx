import { STILL_MANIFEST } from "./still-manifest";
import { shapeFor, type StillKind } from "./still-shapes";

/** One baked shape: a <use> per part, pointing at its group in the shape's file only when `drawn`. */
export function StillSvg({ kind, wide, drawn }: { readonly kind: StillKind; readonly wide: boolean; readonly drawn: boolean }) {
  const shape = STILL_MANIFEST.shapes[shapeFor(kind, wide)];
  return (
    <svg className={wide ? "still-wide" : "still-tall"} viewBox={shape.viewBox.join(" ")} preserveAspectRatio={kind === "anatomy" ? "xMidYMid meet" : "xMidYMax meet"} focusable="false">
      {shape.parts.map((part) => (
        <g key={part} data-part={part}>
          <use href={drawn ? `${shape.href}#${part}` : undefined} />
        </g>
      ))}
    </svg>
  );
}
