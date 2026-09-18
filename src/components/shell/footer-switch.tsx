"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Picks the landing's full footer or the app pages' compact line. Both are server-rendered and passed in. */
export function FooterSwitch({ full, compact }: { readonly full: ReactNode; readonly compact: ReactNode }) {
  return usePathname() === "/" ? full : compact;
}
