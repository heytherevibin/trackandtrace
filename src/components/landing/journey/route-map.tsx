import { routePath, routeSleepers, routeStops, sleeperFractions, stopFractions } from "./geometry/route";
import { TrainGlyph } from "./train-glyph";

/**
 * 05 · the roadmap's track, drawn still as v3 draws it with Motion off: the full line, every sleeper laid, each
 * planned stop passed, and the train at the end. While the journey runs with Motion on, it lays the line as the
 * page scrolls (route.ts), from each piece's data-t. Decoration only; the rows below say everything in words.
 */
export function RouteMap({ count }: { readonly count: number }) {
  const stops = routeStops(count);
  const d = routePath(stops);
  const last = stops.at(-1)!;
  const laid = sleeperFractions(stops);
  const at = stopFractions(stops);
  return (
    <div className="route-map" aria-hidden="true">
      <svg viewBox="0 0 1200 150" focusable="false">
        <path d={d} className="route-path-ghost" />
        <g>
          {routeSleepers(stops).map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="route-sleeper is-laid" data-t={laid[i]} />
          ))}
        </g>
        <path d={d} className="route-path" />
        {stops.map((stop, i) => (
          <g key={stop.x} className="is-passed" data-t={at[i]}>
            <circle cx={stop.x} cy={stop.y} r={7} className="route-stop" />
            <text x={stop.x} y={stop.y + (i % 2 ? 30 : -22)} className="route-num" textAnchor="middle">
              {String(i + 1).padStart(2, "0")}
            </text>
          </g>
        ))}
        <g transform={`translate(${last.x + 50} ${last.y})`} className="route-train">
          <TrainGlyph width={68} height={26} x={-34} y={-13} />
        </g>
      </svg>
    </div>
  );
}
