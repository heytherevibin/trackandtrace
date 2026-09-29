/** A string only the frame meter's chunk carries, so the chunk budgets tell it from the journey's and the scene's
 * (J5-10, J6-15). hud.ts writes it onto the meter's own root element (data-chunk): a value the code reads is one no
 * bundler can drop, where an unread re-export could be, and only hud.ts imports this file, so it lands in that chunk. */
export const HUD_CHUNK_MARK = "tt-hud-chunk";
