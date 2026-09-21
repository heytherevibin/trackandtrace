"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { ChevronDownRegular, SignOutRegular } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MenuContent, MenuItem, MenuLinkItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleHref } from "@/console/href";
import { consoleApiMessage } from "@/console/api-message";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";

const f = consoleMessages.frame;
const fs = consoleMessages.frameSignedIn;

const okSchema = z.object({ ok: z.literal(true) });

// The refusal a member reads comes from consoleApiMessage (@/console/api-message), the one place
// that decides it: SOURCE_UNAVAILABLE and INTERNAL are apiRequest's own technical wording, not
// sheet copy, so a member never sees them raw.
interface State {
  readonly pending: boolean;
  readonly error: string | null;
}

/**
 * The member menu (Main.dc.html): the trigger in the masthead, and its two items -- My keys and
 * Sign out. Sign out posts to the console's own sign-out route, which is where the
 * `{ scope: "local" }` guarantee is made -- not by this call. Local scope matters: a global sign
 * out would revoke the person's traveller sessions along with their console one.
 *
 * The error alert lives outside MenuContent on purpose: Base UI closes the popup on an item's
 * click, and a refusal must still be legible once that happens.
 */
export function MemberMenu({ member }: { readonly member: ConsoleMember }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ pending: false, error: null });

  async function signOut(): Promise<void> {
    setState({ pending: true, error: null });
    const outcome = await apiRequest("/api/sign-out", { method: "POST" }, okSchema);
    if (!outcome.ok) {
      setState({ pending: false, error: consoleApiMessage(outcome.error) });
      return;
    }
    router.replace(consoleHref("/login"));
  }

  const roleLabel = f.roleLabel[member.role];

  return (
    <div className="relative">
      <MenuRoot>
        <MenuTrigger
          aria-label={fs.member.openMenu(member.name, roleLabel)}
          className="inline-flex h-9 shrink-0 items-center gap-2.5 border border-line py-0 pl-1 pr-2.5 hover:border-line-strong max-sm:size-11 max-sm:justify-center max-sm:gap-0 max-sm:border-0 max-sm:p-0"
        >
          <Avatar name={member.name} size="sm" />
          {/* ShellPhone.dc.html and ConsoleMyKeysPhone.dc.html both draw this control as a bare
              avatar square on a phone -- no badge, no chevron, the same box-icon box-lg collapse
              ThemeToggle already gets (ConsoleMasthead's own `max-sm:size-11`). The role stays on
              the trigger's own aria-label regardless, so hiding these two loses nothing a screen
              reader had. Found as a real ~1px overflow at 390px (task-10-report.md), not a style
              preference: with both always shown, this trigger alone was the one thing that pushed
              the signed-in masthead past a 390px viewport. */}
          <Badge variant="steel" caps className="max-sm:hidden">
            {roleLabel}
          </Badge>
          <ChevronDownRegular className="size-3 text-ink-3 max-sm:hidden" aria-hidden="true" />
        </MenuTrigger>
        <MenuContent>
          <div className="flex flex-col gap-2 px-3 py-2">
            <p className="truncate text-sm font-medium text-ink-1">{member.name}</p>
            <p className="truncate text-label text-ink-3">{member.email}</p>
            <Badge variant="steel" caps className="self-start">
              {roleLabel}
            </Badge>
          </div>
          <MenuSeparator />
          <MenuLinkItem render={<Link href={consoleHref("/keys")} />}>{fs.member.myKeys}</MenuLinkItem>
          <MenuSeparator />
          <MenuItem disabled={state.pending} onClick={() => void signOut()}>
            <SignOutRegular className="size-4" aria-hidden="true" />
            {f.signOut}
          </MenuItem>
        </MenuContent>
      </MenuRoot>
      {state.error ? (
        <p role="alert" className="absolute right-0 top-full z-popover mt-2 w-64 border border-line bg-surface-2 px-3 py-2 text-label font-medium text-ink-alert shadow-2">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
