"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { consoleMessages } from "@/console/messages";

const o = consoleMessages.team.lastOwner;

/**
 * dlg_owner (ConsoleTeam.dc.html:334-346): a title, a detail, one primary OK, and no way past it.
 *
 * Built for the change-role dialog in Task 5 and lifted out of it here, unchanged, because Task 6's
 * removal reaches the very same refusal: `console_remove_member` carries `console_change_role`'s
 * unconditional self-check and its `console.require_another_active_owner()` word for word
 * (task-6-addendum.md §4). The sheet draws one dlg_owner, so there is one component -- a second
 * copy would be a second set of words to keep in step with the sheet.
 *
 * Which member it is about is never named, exactly as the sheet draws it: whichever way the floor
 * was reached, the console's answer is about the console.
 */
export function LastOwnerNotice({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-dialog flex items-center justify-center p-4">
          <AlertDialog.Popup className="blueprint w-full max-w-narrow bg-surface-3 p-6 shadow-3 outline-none transition-[transform,opacity] duration-(--duration-slow) ease-out data-[starting-style]:scale-98 data-[starting-style]:opacity-0 data-[ending-style]:scale-98 data-[ending-style]:opacity-0">
            <Corners />
            <AlertDialog.Title className="text-3xl tracking-head">{o.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-body text-ink-2">{o.detail}</AlertDialog.Description>
            {/* One button, not the Cancel/Confirm pair @/components/ui/confirm-dialog draws: the
                sheet gives dlg_owner a single primary OK, because there is nothing here to confirm
                -- it is the console saying no. */}
            <div className="mt-6 flex justify-end">
              <AlertDialog.Close render={<Button variant="primary">{o.ok}</Button>} />
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
