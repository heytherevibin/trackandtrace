import type { ReactNode } from "react";

export function Kbd({ children }: { readonly children: ReactNode }) {
  return <kbd className="font-data inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-line-strong bg-surface-2 px-1.5 text-xs text-ink-2">{children}</kbd>;
}
