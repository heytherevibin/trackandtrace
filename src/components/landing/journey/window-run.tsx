import type { ReactNode } from "react";
import { PinPaper } from "./pin-paper";
import { TrainGlyph } from "./train-glyph";

/**
 * 06–07, the window-seat run's frame (spec §3.A; J6-6). The pin holds a window of three line layers (the far masts, the
 * line, the near posts) and the train, above a track carrying both sections; run.ts pins it and moves them. The
 * layers are empty here: their lines depend on the cards' measured widths, so run.ts draws them (geometry/run.ts).
 * Without the journey, with Motion off, or while it is not pinned, the window and the train are not shown
 * (journey.css) and the two sections read as they always did.
 */
export function WindowRun({ children }: { readonly children: ReactNode }) {
  return (
    <div id="run" className="run">
      <div className="run-pin">
        <div className="run-window" aria-hidden="true">
          <svg className="run-far" focusable="false" />
          <svg className="run-line" focusable="false" />
          <svg className="run-near" focusable="false" />
        </div>
        <span className="run-train" aria-hidden="true">
          <span>
            <TrainGlyph />
          </span>
        </span>
        <div className="run-track">{children}</div>
      </div>
      <PinPaper />
    </div>
  );
}
