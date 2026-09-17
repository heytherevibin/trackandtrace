import { cn } from "@/utils/cn";

export function Separator({ className, decorative = true, dashed = false }: { readonly className?: string; readonly decorative?: boolean; readonly dashed?: boolean }) {
  return <hr className={cn("border-0 border-t border-line", dashed && "border-dashed", className)} aria-hidden={decorative ? "true" : undefined} />;
}
