/** The journey's train, as a glyph: a coach and a locomotive in side elevation. Decoration only. */
export function TrainGlyph() {
  return (
    <svg viewBox="0 0 68 26" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M0 7h27v12H0z" opacity=".55" />
        <path d="M30 5h27l7 5.5V19H30z" />
        <path d="M40 1.5l6 3.2M46 4.7l3-3.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </g>
      {/* A CSS variable only works in a style, never in a presentation attribute. */}
      <g style={{ fill: "var(--surface-0)" }}>
        <path d="M3 9.5h4v3H3zM9 9.5h4v3H9zM15 9.5h4v3h-4zM21 9.5h4v3h-4zM33 8h4v3.4h-4zM55.5 7.2h4.2l3 2.6h-7.2z" />
      </g>
      <g fill="currentColor">
        <circle cx="5" cy="21.5" r="2.2" />
        <circle cx="22" cy="21.5" r="2.2" />
        <circle cx="35" cy="21.5" r="2.4" />
        <circle cx="41" cy="21.5" r="2.4" />
        <circle cx="53" cy="21.5" r="2.4" />
        <circle cx="59" cy="21.5" r="2.4" />
      </g>
    </svg>
  );
}
