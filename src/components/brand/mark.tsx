import { MARK } from "./brand-colors";

// The product mark: a step row of three keys and one lit lamp on a dark plate.
// It keeps its own plate on both faces, as public/brand/mark.svg does.

export function Mark({ size = 24, title, className }: { readonly size?: number; readonly title?: string; readonly className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={className}>
      <rect x="1" y="1" width="30" height="30" rx="6" fill={MARK.plate} stroke={MARK.plateEdge} />
      <rect x="6" y="8" width="5" height="16" rx="1.5" fill={MARK.keyOne} />
      <rect x="13" y="8" width="5" height="16" rx="1.5" fill={MARK.keyTwo} />
      <rect x="20" y="8" width="5" height="16" rx="1.5" fill={MARK.keyThree} />
      <circle cx="27.5" cy="16" r="1.75" fill={MARK.lamp} />
    </svg>
  );
}
