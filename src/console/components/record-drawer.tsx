"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { DismissRegular } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { IconButton } from "@/components/ui/icon-button";
import { messages } from "@/messages";

/**
 * The shell of a record that opens over a list (ConsoleLeads.dc.html's Drawer, and
 * ConsoleAccounts.dc.html's): a 480px plate against the right edge on a desktop, the full screen on
 * a phone, in the geometry of the audit log's entry drawer. A title block, a body that scrolls, and
 * a closing line that never scrolls away.
 *
 * Lifted out of the Leads record when Accounts needed the same shell, unchanged.
 */
export function RecordDrawer({
  title,
  meta,
  regionLabel,
  footer,
  onClose,
  children,
}: {
  readonly title: string;
  /** The title block's second cell ("First seen 2 Sep 2026"), or null when there is no record to date. */
  readonly meta: string | null;
  /** The name of the scrolling part, for a keyboard and a screen reader. */
  readonly regionLabel: string;
  readonly footer: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <BaseDialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Viewport className="fixed inset-0 z-dialog flex justify-end p-3 max-sm:p-0">
          <BaseDialog.Popup
            className={
              "blueprint flex w-[480px] max-w-full flex-col bg-surface-3 shadow-3 outline-none sm:w-[480px] " +
              "max-sm:w-full max-sm:border-0 max-sm:bg-surface-0 max-sm:shadow-none " +
              "transition-transform duration-(--duration-slow) ease-out-expo data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full"
            }
          >
            <span className="max-sm:hidden">
              <Corners />
            </span>
            {/* One header, two geometries: the desktop board's title block (title, a meta cell and
                the Close behind hairlines), and the phone board's 56px bar with nothing ruled. */}
            <div className="border-line flex items-stretch border-b max-sm:h-14 max-sm:items-center max-sm:gap-3 max-sm:pl-4 max-sm:pr-2">
              <h2 className="legend text-ink-1 flex-1 px-5 py-3 leading-6 max-sm:p-0">
                <BaseDialog.Title render={<span />}>{title}</BaseDialog.Title>
              </h2>
              {meta === null ? null : <span className="legend border-line max-sm:legend-sm whitespace-nowrap border-l px-5 py-3 leading-6 max-sm:border-l-0 max-sm:p-0">{meta}</span>}
              <span className="border-line flex items-center border-l px-3 py-1.5 max-sm:border-l-0 max-sm:p-0">
                <BaseDialog.Close render={<IconButton className="max-sm:size-11" label={messages.common.close} icon={<DismissRegular className="size-5" aria-hidden="true" />} size="sm" />} />
              </span>
            </div>
            {/* A stop of its own for a keyboard, as DataTable's scroller is. Until the address is
                revealed the Reveal button is in here and focus can reach it; afterwards nothing in
                it need take focus, and a record taller than the window could not be scrolled by keys. */}
            <div role="region" aria-label={regionLabel} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto">
              {children}
            </div>
            <p className="seam text-ink-3 px-5 py-3.5 text-sm leading-5 max-sm:px-4">{footer}</p>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/**
 * The record's first row: the address, masked until Reveal, and the line that says a reveal was
 * recorded. The whole address is shown for this visit and held nowhere else.
 */
export function RecordAddress({
  masked,
  revealed,
  revealing,
  words,
  onReveal,
}: {
  /** The masked address, as the database gave it. */
  readonly masked: string;
  /** The whole address, once it has been revealed on this visit. */
  readonly revealed: string | null;
  readonly revealing: boolean;
  readonly words: { readonly reveal: string; readonly revealLabel: string; readonly revealedLine: string };
  readonly onReveal: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-3.5 max-sm:px-4">
        <span className="min-w-0 grow text-lg font-medium [overflow-wrap:anywhere]">{revealed ?? masked}</span>
        {revealed === null ? (
          <Button variant="ghost" size="sm" className="max-sm:h-11" aria-label={words.revealLabel} loading={revealing} onClick={onReveal}>
            {words.reveal}
          </Button>
        ) : null}
      </div>
      {revealed === null ? null : (
        <p role="status" className="text-ink-2 text-label -mt-1.5 px-5 pb-3.5 max-sm:px-4">
          {words.revealedLine}
        </p>
      )}
    </>
  );
}
