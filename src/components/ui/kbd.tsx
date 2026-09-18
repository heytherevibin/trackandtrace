import type { ReactNode } from "react";

export function Kbd({ children }: { readonly children: ReactNode }) {
  return <kbd className="font-data inline-flex h-6 min-w-6 items-center justify-center border border-line px-1.5 text-2xs text-ink-2">{children}</kbd>;
}
