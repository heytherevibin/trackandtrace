// Motion, decided before first paint. The footer's Motion switch stores "off" under MOTION_STORAGE_KEY (on
// is the default and is stored as nothing); the device's reduced-motion setting turns Motion off whatever
// is stored. The answer lives on <html data-motion="on|off">: motion.css and Motion (SiteMotion) follow it,
// and React reads it but never writes it on mount, so the first paint is already right.
export const MOTION_STORAGE_KEY = "tt.motion";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type MotionState = "on" | "off";

/** Off when the reader switched Motion off, or the device asks for reduced motion. */
export function resolveMotion(stored: string | null, deviceReduced: boolean): MotionState {
  return stored === "off" || deviceReduced ? "off" : "on";
}

/** Inline in the site's <head>. Restates resolveMotion, since it runs before any module; either read may throw. */
export const MOTION_BOOT_SCRIPT = `(function(){var m="on";try{if(localStorage.getItem("${MOTION_STORAGE_KEY}")==="off")m="off"}catch(e){}try{if(window.matchMedia("${REDUCED_MOTION_QUERY}").matches)m="off"}catch(e){}document.documentElement.setAttribute("data-motion",m)})();`;
