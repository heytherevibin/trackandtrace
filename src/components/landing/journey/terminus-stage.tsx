import { messages } from "@/messages";
import { StillDrawing } from "./still-drawing";
import { StillSvg } from "./still-svg";

/** The terminus (spec §3.A): the whole train arrived, above the closing plate. Decoration; drawn still until J5. */
export function TerminusStage() {
  return (
    <div className="terminus-stage" aria-hidden="true">
      <span className="legend-sm terminus-caption">{messages.home.terminus.caption}</span>
      <StillDrawing kind="terminus" className="terminus-still" />
      <noscript>
        <div className="still-drawing terminus-still is-noscript">
          <StillSvg kind="terminus" wide drawn />
          <StillSvg kind="terminus" wide={false} drawn />
        </div>
      </noscript>
    </div>
  );
}
