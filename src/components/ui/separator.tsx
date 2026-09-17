import { cn } from "@/utils/cn";

export function Separator({ className, decorative = true }: { readonly className?: string; readonly decorative?: boolean }) {
  return <hr className={cn("border-0 border-t border-line", className)} aria-hidden={decorative ? "true" : undefined} />;
}
