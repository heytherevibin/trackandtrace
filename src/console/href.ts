import type { Route } from "next";

/** A console address as the browser sees it on the console host. typedRoutes knows these pages only as /console/…, so the cast lives here, once. */
export function consoleHref(path: `/${string}`): Route {
  return path as Route;
}
