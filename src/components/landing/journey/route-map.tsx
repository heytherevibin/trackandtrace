import { routePath, routeSleepers, routeStops } from "./geometry/route";

/**
 * 05 · the roadmap's track, drawn still as v3 draws it with Motion off: the full line, every sleeper laid, each
 * planned stop passed, and the train at the end. J3 lays the line as the page scrolls. Decoration only; the rows below say
 * everything in words.
 */
export function RouteMap({ count }: { readonly count: number }) {
  const stops = routeStops(count);
  const d = routePath(stops);
  const last = stops.at(-1)!;
  return (
    <div className="route-map" aria-hidden="true">
      <svg viewBox="0 0 1200 150" focusable="false">
        <path d={d} className="route-path-ghost" />
        <g>
          {routeSleepers(stops).map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="route-sleeper is-laid" />
          ))}
        </g>
        <path d={d} className="route-path" />
        {stops.map((stop, i) => (
          <g key={stop.x} className="is-passed">
            <circle cx={stop.x} cy={stop.y} r={7} className="route-stop" />
            <text x={stop.x} y={stop.y + (i % 2 ? 30 : -22)} className="route-num" textAnchor="middle">
              {String(i + 1).padStart(2, "0")}
            </text>
          </g>
        ))}
        <g transform={`translate(${last.x + 50} ${last.y})`} className="route-train">
          <g transform="translate(-34 -13)">
            <path d="M0 7h27v12H0z" fill="currentColor" opacity=".55" />
            <path d="M30 5h27l7 5.5V19H30z" fill="currentColor" />
            <circle cx="5" cy="21.5" r="2.2" fill="currentColor" />
            <circle cx="22" cy="21.5" r="2.2" fill="currentColor" />
            <circle cx="35" cy="21.5" r="2.4" fill="currentColor" />
            <circle cx="59" cy="21.5" r="2.4" fill="currentColor" />
          </g>
        </g>
      </svg>
    </div>
  );
}
