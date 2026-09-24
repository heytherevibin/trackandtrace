"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY } from "./motion-boot";
import { applyMotion, useMotion } from "./use-motion";

/**
 * Motion's own animations follow the site's Motion. When Motion is off they are reduced ("always") whatever
 * the device says; when it is on, the device decides ("user"). SiteMotion also keeps <html data-motion>
 * true while the page is open, when the device setting changes or another tab flips the switch. It never
 * writes on mount: the head script already did.
 */
export function SiteMotion({ children }: { readonly children: ReactNode }) {
  const { motion } = useMotion();
  useEffect(() => {
    const device = window.matchMedia(REDUCED_MOTION_QUERY);
    const onDevice = () => applyMotion();
    const onStorage = (event: StorageEvent) => {
      // event.key is null when another tab cleared the whole store (localStorage.clear()), not just this key.
      if (event.key === null || event.key === MOTION_STORAGE_KEY) applyMotion();
    };
    device.addEventListener("change", onDevice);
    window.addEventListener("storage", onStorage);
    return () => {
      device.removeEventListener("change", onDevice);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return <MotionConfig reducedMotion={motion === "off" ? "always" : "user"}>{children}</MotionConfig>;
}
