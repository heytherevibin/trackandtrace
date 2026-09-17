import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default size names. Our type scale adds
// its own (text-label, text-body, …); without registering them, merge reads them
// as colours and drops whichever of size or colour came first.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "label", "body", "lead", "page", "hero", "signin"],
      tracking: ["caps", "brand", "wide", "head", "display"],
      leading: ["stack"],
    },
  },
});

/** Class composition with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
