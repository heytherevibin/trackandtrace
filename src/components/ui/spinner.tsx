import { cn } from "@/utils/cn";

/** A thin-stroke ring, drawn at the icon weight (1.5). */
export function Spinner({ size = "md", label, className }: { readonly size?: "sm" | "md"; readonly label?: string; readonly className?: string }) {
  return (
    <svg
      className={cn("spin shrink-0", size === "sm" ? "size-4" : "size-5", className)}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
