// Motion, decided before first paint. The footer's Motion switch stores "off" under MOTION_STORAGE_KEY (on
// is the default and is stored as nothing); the device's reduced-motion setting turns Motion off whatever
// is stored. The answer lives on <html data-motion="on|off">: motion.css and Motion (SiteMotion) follow it,
// and React reads it but never writes it on mount, so the first paint is already right.
// It also decides Data Saver (`data-saver`) and whether the landing's drawing is live or still (`data-drawing`, spec §3.C).
export const MOTION_STORAGE_KEY = "tt.motion";
export const QUALITY_STORAGE_KEY = "tt.q";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const REDUCED_DATA_QUERY = "(prefers-reduced-data: reduce)";
export const SLOW_CONNECTIONS = ["slow-2g", "2g", "3g"] as const;

export type MotionState = "on" | "off";
export type SaverState = "on" | "off";
export type DrawingState = "live" | "still";

export interface ConnectionHint {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/** Off when the reader switched Motion off, or the device asks for reduced motion. */
export function resolveMotion(stored: string | null, deviceReduced: boolean): MotionState {
  return stored === "off" || deviceReduced ? "off" : "on";
}

/** On when the device asks for reduced data, Save-Data is set, or the connection is a slow one. */
export function resolveSaver(connection: ConnectionHint | null | undefined, reducedData: boolean): SaverState {
  if (reducedData || connection?.saveData) return "on";
  return SLOW_CONNECTIONS.some((type) => type === connection?.effectiveType) ? "on" : "off";
}

/** Still unless Motion is on, Data Saver is off, and this session did not fall to its floor. */
export function resolveDrawing(motion: MotionState, saver: SaverState, quality: string | null): DrawingState {
  return motion === "off" || saver === "on" || quality === "still" ? "still" : "live";
}

/** Inline in the site's <head>. Restates the resolvers, since it runs before any module; every read may throw. */
export const MOTION_BOOT_SCRIPT = `(function(){var r=document.documentElement,m="on",s="off",q=null;try{if(localStorage.getItem("${MOTION_STORAGE_KEY}")==="off")m="off"}catch(e){}try{if(window.matchMedia("${REDUCED_MOTION_QUERY}").matches)m="off"}catch(e){}try{var c=navigator.connection;if(c&&(c.saveData||${JSON.stringify(SLOW_CONNECTIONS)}.indexOf(c.effectiveType)>=0))s="on"}catch(e){}try{if(window.matchMedia("${REDUCED_DATA_QUERY}").matches)s="on"}catch(e){}try{q=sessionStorage.getItem("${QUALITY_STORAGE_KEY}")}catch(e){}r.setAttribute("data-motion",m);r.setAttribute("data-saver",s);r.setAttribute("data-drawing",m==="off"||s==="on"||q==="still"?"still":"live")})();`;
