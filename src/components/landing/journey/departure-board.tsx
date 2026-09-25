import { IstClock } from "@/components/shell/ist-clock";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import { STATIONS, kmFigure } from "./stations";

/** Departures · Platform 3, under the hero: the page's sections as departures. J3 adds the status column, which follows the scroll. */
export function DepartureBoard() {
  const m = messages.journey.board;
  return (
    <section id="departures" aria-labelledby="board-title" className="pb-10 pt-2">
      <div className="blueprint board">
        <Corners />
        <div className="flex flex-wrap items-stretch border-b border-line">
          <h2 id="board-title" className="legend min-w-[16ch] flex-1 px-5 py-3 leading-6 text-ink-1 max-sm:basis-full">
            {m.title}
          </h2>
          <span className="legend whitespace-nowrap border-l border-line px-5 py-3 leading-6 max-sm:flex-1 max-sm:border-l-0 max-sm:border-t">{m.scope}</span>
          <span className="flex items-center whitespace-nowrap border-l border-line px-5 py-3 max-sm:border-t">
            <IstClock />
          </span>
        </div>
        <table className="board-table">
          <caption className="sr-only">{m.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{m.stn}</th>
              <th scope="col">{m.destination}</th>
              <th scope="col" className="board-km">
                {m.km}
              </th>
            </tr>
          </thead>
          <tbody>
            {STATIONS.slice(1).map((station) => (
              <tr key={station.id}>
                <td className="board-code">{station.code}</td>
                <td className="board-name">
                  <a href={`#${station.id}`} className="tap-44">
                    {station.name}
                  </a>
                </td>
                <td className="board-km tnum">{kmFigure(station.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
