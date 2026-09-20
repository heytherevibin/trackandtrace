"use client";

import { useEffect } from "react";

/** Marks the document once React is interactive; styles and tests key off it (html[data-hydrated]). */
export function HydrationMarker(): null {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
