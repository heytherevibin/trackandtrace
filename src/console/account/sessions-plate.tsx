"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plate } from "@/components/ui/plate";
import { notify } from "@/components/ui/toast";
import { fetchMySessions, signOutOthers } from "@/console/account/my-keys-client";
import type { MySessionRow } from "@/console/account/my-sessions";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";
import { formatRelative, formatTime } from "@/utils/datetime";

const m = consoleMessages.myKeys;
const s = m.sessions;
const clock = consoleMessages.frameSignedIn.clock;

/** "09:12 IST" -- formatTime plus the console clock's own IST legend (task-9-addendum.md §2: reuse it, don't invent a second one). */
function atTime(when: string): string {
  return `${formatTime(when)} ${clock.ist}`;
}

/**
 * "yesterday, 22:40 IST" -- ConsoleMyKeys.dc.html:142's own shape for a session that is not this
 * one. The day comes from the shared formatRelative, which already says "yesterday", "3 hr ago" and
 * the like, so this adds no second vocabulary of its own; the time is the same atTime the current
 * row uses. A session the database has never marked as seen falls back to when it was created --
 * the row still has to say something, and when it started is the honest answer.
 */
function lastSeenAt(lastSeenAt: string | null, createdAt: string): string {
  const when = lastSeenAt ?? createdAt;
  return `${formatRelative(when)}, ${atTime(when)}`;
}

/**
 * The Sessions plate (ConsoleMyKeys.dc.html:137-144): where this member is signed in, and a way to
 * sign the other sessions out. Follows KeysPlate's own shape (task-9-addendum.md §5): owns its rows,
 * re-fetches after a change rather than patching state, and reports a failed re-read instead of
 * going quiet.
 *
 * No tap: signing your own other sessions out only ever reduces your own access, so this uses the
 * shared ConfirmDialog (src/components/ui/confirm-dialog.tsx) rather than ConfirmItsYou -- the same
 * reasoning Task 1 gave and this task's brief repeats.
 */
export function SessionsPlate({ sessions: initialSessions }: { readonly sessions: readonly MySessionRow[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [plateError, setPlateError] = useState<string | null>(null);

  // Same shape as KeysPlate.refresh: a write that lands and a re-read that does not is the worst of
  // both outcomes, so a failed re-read says so rather than leaving stale rows on screen in silence.
  async function refresh(): Promise<void> {
    const fresh = await fetchMySessions();
    if (fresh) setSessions(fresh);
    else setPlateError(consoleMessages.session.unavailable);
  }

  // Closes the dialog first, the same order KeysPlate's own handleRemoveConfirmed uses for
  // ConfirmItsYou: by the time a refusal (or a re-read failure) comes back there is no dialog left
  // open to show it in, so it goes to plateError instead, the same place a refresh failure does.
  async function handleConfirmed(): Promise<void> {
    setConfirmOpen(false);
    setPlateError(null);
    const outcome = await signOutOthers();
    if (outcome.kind === "done") {
      notify.success(s.signedOutToast);
      await refresh();
      return;
    }
    setPlateError(outcome.message);
  }

  // othersShown (ConsoleMyKeys.dc.html's own state script): once every other session is gone, so is
  // this whole block -- a re-fetch gives that for free, no animation or special-casing needed
  // (task-9-addendum.md §1).
  const others = sessions.filter((session) => !session.isCurrent);

  return (
    <Plate as="section" title={m.sessionsTitle} titleId="mk-sessions" headingLevel={2} padding="none">
      <ul className="flex flex-col">
        {sessions.map((session, index) => (
          <li key={session.id} className={cn("flex items-center gap-3 px-5 py-3.5", index > 0 && "border-t border-line")}>
            <span className="flex-1 text-sm">
              {session.isCurrent
                ? s.row(session.deviceLabel, atTime(session.createdAt))
                : s.otherRow(session.deviceLabel, lastSeenAt(session.lastSeenAt, session.createdAt))}
            </span>
            {session.isCurrent ? <Badge variant="accent">{s.thisDevice}</Badge> : null}
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <div className="border-t border-line px-5 py-3.5">
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            {s.signOutOthers}
          </Button>
        </div>
      ) : null}
      {plateError ? (
        <p role="alert" className="border-t border-line px-5 py-3.5 text-label font-medium text-ink-alert">
          {plateError}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={s.confirmTitle}
        description={s.confirmBody(others.map((session) => session.deviceLabel))}
        confirmLabel={s.confirmConfirm}
        cancelLabel={s.cancel}
        tone="primary"
        onConfirm={() => handleConfirmed()}
      />
    </Plate>
  );
}
