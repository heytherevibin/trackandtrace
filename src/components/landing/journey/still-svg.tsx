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

/**
 * The train, drawn still, for a page without JavaScript (spec §3.H): the WIDE shape only, so a script-less
 * visit fetches at most two baked files (one per chapter), never four. Chromium fetches a `<use href>`'s
 * target even inside a `display: none` svg, so drawing both shapes here (as the scripted copy does, picking
 * between them by width) would fetch every file regardless of which one a reader's width actually shows.
 */
export function StillNoscript({ kind, className }: { readonly kind: StillKind; readonly className: string }) {
  return (
    <noscript>
      <div className={`still-drawing ${className} is-noscript`} aria-hidden="true">
        <StillSvg kind={kind} wide drawn />
      </div>
    </noscript>
  );
}
