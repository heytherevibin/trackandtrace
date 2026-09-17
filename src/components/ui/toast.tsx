"use client";

import { Toaster, toast } from "sonner";
import { useTheme } from "@/components/theme/use-theme";

// Sonner, drawn as a small plate. Transient confirmations only; errors that
// need a decision render inline.

export function ToastHost() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      theme={resolvedTheme ?? "system"}
      offset="calc(var(--safe-bottom) + 16px)"
      mobileOffset="calc(var(--safe-bottom) + 12px)"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "z-toast flex w-full max-w-narrow items-center gap-3 border border-line bg-surface-2 px-4 py-3 text-sm text-ink-1 shadow-2",
          title: "font-medium",
          description: "text-ink-2",
          actionButton: "press ml-auto h-8 border border-accent-strong bg-accent-strong px-2.5 font-display text-label font-semibold text-accent-ink hover:bg-accent-strong-hover",
          cancelButton: "press ml-auto h-8 border border-line px-2.5 font-display text-label font-semibold text-ink-1",
          success: "border-l-2 border-l-accent",
          error: "border-l-2 border-l-ink-alert",
          info: "border-line",
        },
      }}
    />
  );
}

export const notify = {
  success: (message: string, description?: string) => toast.success(message, { description }),
  error: (message: string, description?: string) => toast.error(message, { description }),
  info: (message: string, description?: string) => toast(message, { description }),
  /** A confirmation with an undo action; returns the toast id so callers can dismiss it. */
  undoable: (message: string, onUndo: () => void, label = "Undo") => toast(message, { action: { label, onClick: onUndo }, duration: 6_000 }),
  dismiss: (id?: string | number) => toast.dismiss(id),
} as const;
