import { messages } from "@/messages";
import { STATIONS, kmFigure, stopName, stopTop } from "./stations";
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
 * The landing's route rail (from 48rem): a fixed column down the page's left edge, below the masthead, with the
 * page's stations on a rail from top to bottom, each a named link to its section. The odometer at the column's
 * foot and the train are the journey's: they show only while it runs (journey-island.css), because only then do
 * they stay true as the page scrolls. The current stop is marked by the journey (aria-current); nothing spells
 * its name out beside the rail. Below 48rem the column is not shown, and {@link PhoneRail} carries the train.
 */
export function RouteStrip() {
  const m = messages.journey.strip;
  return (
    <nav id="route-strip" aria-label={m.label} className="route-strip">
      <div className="strip-row">
        <div className="strip-track">
          <div className="strip-rail" aria-hidden="true" />
          <ol className="strip-stops">
            {STATIONS.map((station, i) => (
              <li key={station.id} style={{ top: stopTop(i, STATIONS.length) }}>
                <a href={`#${station.id}`} aria-label={stopName(station)}>
                  {station.code}
                </a>
              </li>
            ))}
          </ol>
          <Train />
        </div>
        <span className="strip-odo tnum" aria-hidden="true">
          {m.km(kmFigure(0))}
        </span>
      </div>
    </nav>
  );
}

/**
 * Below 48rem: a hairline rail along the masthead's foot, carrying the train alone (the journey's). It is its own
 * aria-hidden element inside the masthead, so phones never expose an empty navigation landmark.
 */
export function PhoneRail() {
  return (
    <div className="phone-rail" aria-hidden="true">
      <Train />
    </div>
  );
}
