import { messages } from "@/messages";
import { STATIONS, kmFigure, stopLeft, stopName } from "./stations";
import { TrainGlyph } from "./train-glyph";

/**
 * The masthead's second row on the landing: the page's stations on a rail, with the kilometre reading and the
 * current station. Drawn at rest at DEP; J3 moves the train and the readings as the page scrolls. On a phone,
 * it is a hairline rail in the masthead's bottom edge (journey.css).
 */
export function RouteStrip() {
  const m = messages.journey.strip;
  const first = STATIONS[0]!;
  return (
    <nav id="route-strip" aria-label={m.label} className="route-strip">
      <div className="page-frame strip-row">
        <span className="strip-odo" aria-hidden="true">
          {m.km(kmFigure(first.km))}
        </span>
        <div className="strip-track">
          <div className="strip-rail rail" aria-hidden="true" />
          <ol className="strip-stops">
            {STATIONS.map((station, i) => (
              <li key={station.id} style={{ left: stopLeft(i, STATIONS.length) }}>
                <a href={`#${station.id}`} aria-label={stopName(station)} className="tap-44">
                  {station.code}
                </a>
              </li>
            ))}
          </ol>
          <span className="strip-train" aria-hidden="true">
            <TrainGlyph />
          </span>
        </div>
        <span className="strip-now">{m.stop(first.code, first.name)}</span>
      </div>
    </nav>
  );
}
