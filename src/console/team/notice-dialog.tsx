"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { consoleMessages } from "@/console/messages";

const o = consoleMessages.team.lastOwner;

/**
 * The shape ConsoleTeam.dc.html draws for a console saying no: a `role="alertdialog"` with a title,
 * a detail, one primary button and no way past it (dlg_owner, :334-346).
 *
 * The markup came from Task 5's change-role dialog and moved here in two steps -- out of that
 * dialog when Task 6's removal reached the identical dlg_owner, and split from its words in fix
 * round 1 when Reset keys needed the same shape with a different sentence. The words are always the
 * caller's, from the messages file; what is shared is the one drawn form, so a second refusal
 * cannot quietly grow a second look.
 */
export function NoticeDialog({
  open,
  title,
  detail,
  ok,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly detail: string;
  readonly ok: string;
  readonly onClose: () => void;
}) {
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
            <AlertDialog.Title className="text-3xl tracking-head">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2.5 text-body text-ink-2">{detail}</AlertDialog.Description>
            {/* One button, not the Cancel/Confirm pair @/components/ui/confirm-dialog draws: the
                sheet gives dlg_owner a single primary OK, because there is nothing here to confirm
                -- it is the console saying no. */}
            <div className="mt-6 flex justify-end">
              <AlertDialog.Close render={<Button variant="primary">{ok}</Button>} />
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * dlg_owner itself, word for word (:334-346), shown for a role change and for a removal alike --
 * `console_remove_member` carries `console_change_role`'s two refusals verbatim
 * (task-6-addendum.md §4), so one set of words serves both, as the sheet draws it.
 *
 * Which member it is about is never named, exactly as the sheet draws it: whichever way the floor
 * was reached, the console's answer is about the console.
 */
export function LastOwnerNotice({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return <NoticeDialog open={open} title={o.title} detail={o.detail} ok={o.ok} onClose={onClose} />;
}
