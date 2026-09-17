import { messages } from "@/messages";

// An Indian railway platform in side elevation, drawn in hairlines so it prints
// in the steel duotone like the photograph the sheet leaves room for: the canopy
// and its truss on steel columns, the platform number board, a sleeper coach
// with doors, barred windows and livery stripes, a colour-light signal, and the
// platform coping with its face panels and a level mark.

const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1, vectorEffect: "non-scaling-stroke" } as const;
const SOLID = { ...LINE, className: "fill-surface-0" } as const;

const CANOPY_END = 470;
const COLUMNS = [90, 280, 450] as const;
const WINDOWS = [100, 156, 212, 268, 324, 380, 436, 492] as const;
const VENTS = [120, 260, 400] as const;
const PANEL_JOINTS = [75, 150, 225, 300, 375, 450, 525] as const;

/** The truss under the canopy: a zigzag between the fascia and the bottom chord. */
function trussPath(): string {
  const step = 26;
  const count = Math.floor(CANOPY_END / step);
  const points = Array.from({ length: count + 1 }, (_, i) => `${i === 0 ? "M" : "L"}${i * step} ${i % 2 === 0 ? 48 : 70}`);
  return points.join(" ");
}

function Canopy() {
  return (
    <g>
      <path {...LINE} d={`M0 34 L${CANOPY_END} 34 L${CANOPY_END} 48 L0 48`} />
      <path {...LINE} d={`M0 40 L${CANOPY_END} 40`} />
      <path {...LINE} d={trussPath()} />
      <path {...LINE} d={`M0 70 L${CANOPY_END} 70`} />
      {COLUMNS.map((x) => (
        <g key={x}>
          <path {...LINE} d={`M${x - 5} 92 L${x - 24} 70 M${x + 5} 92 L${x + 24} 70`} />
          <rect {...SOLID} x={x - 5} y={48} width={10} height={252} />
          <rect {...SOLID} x={x - 9} y={294} width={18} height={6} />
        </g>
      ))}
      <path {...LINE} d="M208 70 L208 80 M244 70 L244 80" />
      <rect {...SOLID} x={196} y={80} width={60} height={40} />
      <rect {...LINE} x={199} y={83} width={54} height={34} />
      <text x={226} y={110} textAnchor="middle" className="fill-current font-display text-3xl font-semibold">
        {messages.home.photo.platformNumber}
      </text>
    </g>
  );
}

function Coach() {
  return (
    <g>
      {/* the tail of the coach ahead, and the gangway bellows */}
      <path {...LINE} d="M-10 136 L2 136 Q16 138 16 150 L16 300" />
      <path {...LINE} d="M20 154 L20 290 M24 154 L24 290 M28 154 L28 290" />
      {/* body and roof */}
      <path {...LINE} d="M32 300 L32 150 Q32 138 46 136 L610 136" />
      <path {...LINE} d="M32 150 L610 150" />
      {VENTS.map((x) => (
        <rect key={x} {...LINE} x={x} y={127} width={34} height={9} />
      ))}
      {/* doors with their windows and grab rails */}
      {[46, 556].map((x) => (
        <g key={x}>
          <rect {...LINE} x={x} y={164} width={32} height={136} />
          <rect {...LINE} x={x + 6} y={176} width={20} height={24} />
          <path {...LINE} d={`M${x - 3} 196 L${x - 3} 256 M${x + 35} 196 L${x + 35} 256`} />
        </g>
      ))}
      {WINDOWS.map((x) => (
        <g key={x}>
          <rect {...LINE} x={x} y={172} width={40} height={30} />
          <path {...LINE} d={`M${x} 187 L${x + 40} 187 M${x + 13} 172 L${x + 13} 202 M${x + 27} 172 L${x + 27} 202`} />
        </g>
      ))}
      <path {...LINE} d="M32 224 L610 224 M32 230 L610 230" />
      <rect {...LINE} x={300} y={246} width={44} height={14} />
    </g>
  );
}

function Signal() {
  return (
    <g>
      <rect {...SOLID} x={537} y={126} width={6} height={174} />
      <rect {...SOLID} x={526} y={64} width={28} height={62} />
      {[78, 95, 112].map((cy) => (
        <g key={cy}>
          <circle {...LINE} cx={540} cy={cy} r={6} />
          <path {...LINE} d={`M531 ${cy - 4} Q540 ${cy - 11} 549 ${cy - 4}`} />
        </g>
      ))}
      <path {...LINE} d="M540 64 L540 54" />
    </g>
  );
}

function Platform() {
  return (
    <g>
      <rect className="fill-surface-0" x={-1} y={300} width={602} height={101} />
      <path {...LINE} d="M0 300 L600 300 M0 308 L600 308" />
      <path {...LINE} d={Array.from({ length: 50 }, (_, i) => `M${i * 12} 308 L${i * 12 + 8} 300`).join(" ")} />
      <path {...LINE} d="M0 352 L600 352" />
      <path {...LINE} d={PANEL_JOINTS.map((x) => `M${x} 308 L${x} 400`).join(" ")} />
      {/* level mark: the platform height as a dimension line */}
      <path {...LINE} d="M20 300 L20 392 M14 300 L26 300 M14 392 L26 392" />
    </g>
  );
}

export function PlatformDrawing({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 600 400" aria-hidden="true" focusable="false" className={className}>
      <Coach />
      <Signal />
      <Canopy />
      <Platform />
    </svg>
  );
}
