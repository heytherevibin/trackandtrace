import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { KeysPlate } from "@/console/account/keys-plate";
import { getMyKeys } from "@/console/account/my-keys";
import { ProfilePlate } from "@/console/account/profile-plate";
import { requireConsoleMember } from "@/console/auth/guard";
import { ConsoleFrame } from "@/console/components/console-frame";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const m = consoleMessages.myKeys;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * My keys (ConsoleMyKeys.dc.html): the keys a member signs in with, and their own profile. `/`
 * redirects here (src/app/console/page.tsx), and until this page existed a signed-in member landing
 * on it fell through to the not-found state -- this is what makes `/` land somewhere real for the
 * first time (task-6-addendum.md's headline check).
 *
 * A Server Component, like every other console page: it calls the guard once and passes the member
 * down to ConsoleFrame, which does not call it itself (task-6-addendum.md §6).
 *
 * requireConsoleMember() is caught and sent to /login on any failure -- the same pattern
 * src/app/console/[...missing]/page.tsx already uses -- rather than left to throw: a member with no
 * session (or one that has genuinely ended) reaching /keys is the ordinary "not signed in" case every
 * console page handles this way, not a fault. This matters here specifically because this page is now
 * what a signed-out visit to `/` (which redirects to `/keys`) reaches; a throw here would have shown
 * the generic error boundary, or worse, to a request with no `authenticated` role at all (PostgREST's
 * own "permission denied for function console_me", which src/console/auth/guard.ts's fromDatabase
 * does not recognise as a session problem -- a pre-existing gap this page is the first to reach
 * uncaught, since every existing caller either already redirects on any failure the way this one now
 * does, or is only ever reached by an already-signed-in browser in practice; flagged in
 * task-6-report.md rather than fixed here, since guard.ts is not this task's file).
 *
 * getMyKeys(), by contrast, only ever runs once requireConsoleMember() has already succeeded, so its
 * failure is left to propagate to the console's own error boundary (src/app/console/error.tsx, task
 * 5) rather than a bespoke in-page error state -- the sheet's isError copy ("Your keys didn't load" /
 * "The console couldn't reach its database.") is not in the brief's quoted-copy list, so it is not
 * transcribed here.
 *
 * Adding, renaming, removing a key and the Sessions plate are later tasks; this page is the read
 * path and the table only (task-6-addendum.md's scope line).
 */
export default async function MyKeysPage() {
  // Only a missing or ended session sends anyone to sign in. Anything else -- a console whose
  // grants are wrong, a database that is down -- is a fault, and swallowing it here would send a
  // member to /login looking like an ordinary sign-out while the real cause went unreported. That
  // is the same thing guard.ts's own mapping refuses to do, and this page is where all traffic
  // lands via /, so it is the worst place to undo it. A rethrow reaches src/app/console/error.tsx.
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));
  const { keys, member: profile } = await getMyKeys();

  return (
    <ConsoleFrame member={member}>
      <div className="flex flex-col gap-8">
        <PageHeader kicker={m.kicker} title={m.title} lead={m.lead} />
        <KeysPlate keys={keys} />
        <ProfilePlate member={profile} />
      </div>
    </ConsoleFrame>
  );
}
