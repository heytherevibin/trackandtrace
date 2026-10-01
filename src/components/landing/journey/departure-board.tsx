import { IstClock } from "@/components/shell/ist-clock";
import { Corners } from "@/components/ui/corners";
import { STACKED_ROLES as R } from "@/components/ui/stacked-table";
import { messages } from "@/messages";
import { STATIONS, kmFigure } from "./stations";

/** Departures · Platform 3, under the hero: the page's sections as departures. The status column is the
 * journey's: it shows while the journey runs, and follows the scroll. With text grown past what the board's width holds
 * (200% on a phone) its rows reflow as grids (journey.css), so the table carries explicit roles, as stacked tables do. */
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
        <table role={R.table} className="board-table">
          <caption className="sr-only">{m.caption}</caption>
          <thead role={R.rowgroup}>
            <tr role={R.row}>
              <th role={R.columnheader} scope="col">
                {m.stn}
              </th>
              <th role={R.columnheader} scope="col">
                {m.destination}
              </th>
              <th role={R.columnheader} scope="col" className="board-km">
                {m.km}
              </th>
              <th role={R.columnheader} scope="col" className="board-status">
                {m.status}
              </th>
            </tr>
          </thead>
          <tbody role={R.rowgroup}>
            {STATIONS.slice(1).map((station, i) => (
              <tr key={station.id} role={R.row} data-stop={i + 1}>
                <td role={R.cell} className="board-code">{station.code}</td>
                <td role={R.cell} className="board-name">
                  <a href={`#${station.id}`} className="tap-44">
                    {station.name}
                  </a>
                </td>
                <td role={R.cell} className="board-km tnum">{kmFigure(station.km)}</td>
                <td role={R.cell} className="board-status" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
