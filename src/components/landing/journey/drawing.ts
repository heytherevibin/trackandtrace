import { animate, svg, utils, type AnimationParams, type JSAnimation } from "animejs";

// Drawn strokes, for every module that draws one (the hero dial's rings and arc, the berth plan).
//
// A draw is never reverted: svg.createDrawable's proxy captures whatever "draw" value is current on the element
// as its animation's own "original" (drawable.js), and createDrawable itself writes "0 0" the first time it
// wraps a stroke, so reverting a completed draw restores the hidden "0 0" state, not the server's markup —
// leaving the stroke invisible after any rebuild (Motion toggled, a chapters refit). And utils.remove(strokes)
// cannot cancel a running draw either: createDrawable returns a fresh Proxy on every call, and Anime.js matches
// a tween to remove by strict target reference (animation/composition.js), so removing by the raw elements never
// matches the Proxy the tween actually holds. So a Drawing keeps its own draw's handle and cancels it directly
// (Timer#cancel, never #revert), then clears exactly what drawable.js writes to a stroke: the `pathLength`
// attribute it sets once, the `draw`, `stroke-dasharray` and `stroke-dashoffset` attributes it sets on every
// draw, and the inline `stroke-linecap` it switches to "butt" while a stroke is empty.

const WRITTEN = ["pathLength", "draw", "stroke-dasharray", "stroke-dashoffset"] as const;

export interface Drawing {
  /** Puts the strokes at `draw` ("0 0" hides them) now, cancelling any draw still running. */
  hold(draw: string): void;
  /** Draws the strokes with these params, cancelling any draw still running. */
  play(params: AnimationParams): void;
  /** Cancels the draw by its handle and removes everything drawable.js wrote: the server's strokes again. */
  clear(): void;
}

export function drawStrokes(strokes: readonly SVGGeometryElement[]): Drawing {
  let handle: JSAnimation | null = null;
  const cancel = () => {
    handle?.cancel();
    handle = null;
  };
  return {
    hold: (draw) => {
      cancel();
      if (strokes.length) handle = utils.set(svg.createDrawable([...strokes]), { draw });
    },
    play: (params) => {
      cancel();
      if (strokes.length) handle = animate(svg.createDrawable([...strokes]), params);
    },
    clear: () => {
      cancel();
      for (const el of strokes) {
        for (const name of WRITTEN) el.removeAttribute(name);
        el.style.removeProperty("stroke-linecap");
      }
    },
  };
}
