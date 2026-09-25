import { messages } from "@/messages";
import { STATIONS, stopLeft, stopName } from "./stations";

/**
 * The masthead's second row on the landing (from 48rem): the page's stations on a rail, each a named link to
 * its section. This is only what stays true while the page stands still — the odometer, the current station
 * and the train become false the moment a reader scrolls, so J3 adds them together with the motion that keeps
 * them honest. Below 48rem there is no strip at all, for the same reason.
 */
export function RouteStrip() {
  const m = messages.journey.strip;
  return (
    <nav id="route-strip" aria-label={m.label} className="route-strip">
      <div className="page-frame strip-row">
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
        </div>
      </div>
    </nav>
  );
}
