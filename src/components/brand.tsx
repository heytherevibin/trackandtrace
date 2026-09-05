/** Brand mark — a single precision dial glyph. Pure SVG, no icon fonts. */

export function Sigil({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="16" cy="16" r="14" stroke="var(--line-2)" strokeWidth="1.4" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const big = i % 3 === 0;
        const r1 = big ? 11 : 12.4;
        const r2 = 13;
        return (
          <line
            key={i}
            x1={16 + r1 * Math.sin(a)}
            y1={16 - r1 * Math.cos(a)}
            x2={16 + r2 * Math.sin(a)}
            y2={16 - r2 * Math.cos(a)}
            stroke={i % 3 === 0 ? "var(--bone)" : "var(--steel)"}
            strokeWidth={big ? 1.6 : 1}
          />
        );
      })}
      <line
        x1="16"
        y1="16"
        x2="16"
        y2="6.5"
        stroke="var(--stop)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="1.6" fill="var(--brass)" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Sigil />
      {!compact && (
        <span className="leading-none">
          <span className="block text-[13px] font-bold tracking-[0.14em] text-bone uppercase">
            Track&nbsp;&amp;&nbsp;Trace
          </span>
          <span className="mt-1 block font-data text-[10px] tracking-[0.3em] text-steel uppercase">
            Journey intelligence
          </span>
        </span>
      )}
    </span>
  );
}
