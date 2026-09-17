import { cn } from "@/utils/cn";

/** The running request: a 2px track with a steel bar sweeping across it. Decorative; pair with a live status line. */
export function SweepBar({ className }: { readonly className?: string }) {
  return (
    <div aria-hidden="true" className={cn("h-0.5 overflow-hidden bg-accent/20", className)}>
      <div className="sweep h-full w-[30%] bg-accent" />
    </div>
  );
}
