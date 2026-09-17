"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

export const TooltipProvider = BaseTooltip.Provider;

/** Hover and focus hint. Never the only label for a control. */
export function Tooltip({ content, children, side = "top" }: { readonly content: ReactNode; readonly children: ReactElement; readonly side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-popover">
          <BaseTooltip.Popup className="popup-motion rounded-sm border border-line-strong bg-surface-inverse px-2 py-1 text-xs text-ink-inverse shadow-2">{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
