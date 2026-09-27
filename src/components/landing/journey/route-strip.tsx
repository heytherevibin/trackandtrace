import { messages } from "@/messages";
import { STATIONS, kmFigure, stopLeft, stopName } from "./stations";
import { TrainGlyph } from "./train-glyph";

function Train() {
  return (
    <span className="strip-train" aria-hidden="true">
      <span className="strip-glyph">
        <TrainGlyph />
      </span>
    </span>
  );
}

/**
 * The masthead's second row on the landing (from 48rem): the page's stations on a rail, each a named link to its
 * section. The odometer, the current station and the train are the journey's: they show only while it runs
 * (journey-island.css), because only then do they stay true as the page scrolls. Below 48rem the strip is a
 * hairline rail along the masthead's foot, carrying the train alone; it is its own aria-hidden element, so phones
 * never expose an empty navigation landmark.
 */
export function RouteStrip() {
  const m = messages.journey.strip;
  return (
    <>
      <nav id="route-strip" aria-label={m.label} className="route-strip">
        <div className="page-frame strip-row">
          <span className="strip-odo tnum" aria-hidden="true">
            {m.km(kmFigure(0))}
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
            <Train />
          </div>
          <span className="strip-now" aria-hidden="true">
            {stopName(STATIONS[0]!)}
          </span>
        </div>
      </nav>
      <div className="phone-rail" aria-hidden="true">
        <Train />
      </div>
    </>
  );
}
