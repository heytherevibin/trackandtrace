"use client";

import { Toaster, toast } from "sonner";
import { useTheme } from "@/components/theme/use-theme";

// Sonner, dressed in the panel's own material. Transient confirmations only;
// errors that need a decision render inline.

export function ToastHost() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      theme={resolvedTheme ?? "system"}
      offset="calc(var(--tabbar-height) + 12px)"
      mobileOffset="calc(var(--tabbar-height) + 12px)"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "panel z-toast flex w-full max-w-narrow items-center gap-3 px-4 py-3 text-sm text-ink-1 shadow-2",
          title: "font-medium",
          description: "text-ink-2",
          actionButton: "press ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink",
          cancelButton: "press ml-auto rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-1",
          success: "border-go-line",
          error: "border-stop-line",
          info: "border-line-strong",
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
  undoable: (message: string, onUndo: () => void, label = "Undo") =>
    toast(message, { action: { label, onClick: onUndo }, duration: 6_000 }),
  dismiss: (id?: string | number) => toast.dismiss(id),
} as const;
