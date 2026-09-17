// The mark is the product's own control: a step row of three keys and one lit
// lamp on a key-cap plate. Reads on both faces because the plate uses the cap
// token (white by night, charcoal by day).

export function Mark({ size = 28, title, className }: { readonly size?: number; readonly title?: string; readonly className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={className}>
      <rect x="1" y="1" width="30" height="30" rx="5" fill="var(--key-cap)" stroke="var(--line-strong)" />
      <rect x="6" y="8" width="5" height="16" rx="1.5" fill="var(--key-red)" />
      <rect x="13" y="8" width="5" height="16" rx="1.5" fill="var(--key-orange)" />
      <rect x="20" y="8" width="5" height="16" rx="1.5" fill="var(--key-yellow)" />
      <circle cx="27.5" cy="16" r="1.75" fill="var(--key-led)" />
    </svg>
  );
}
