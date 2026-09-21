import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { KeysPlate } from "@/console/account/keys-plate";
import { getMyKeys } from "@/console/account/my-keys";
import { getMySessions } from "@/console/account/my-sessions";
import { ProfilePlate } from "@/console/account/profile-plate";
import { SessionsPlate } from "@/console/account/sessions-plate";
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
 * An UNAUTHENTICATED requireConsoleMember() is caught and sent to /login -- the same narrowing
 * src/app/console/[...missing]/page.tsx now carries -- rather than left to throw: a member with no
 * session (or one that has genuinely ended) reaching /keys is the ordinary "not signed in" case every
 * console page handles this way, not a fault. This matters here specifically because this page is now
 * what a signed-out visit to `/` (which redirects to `/keys`) reaches; a throw there would have shown
 * the generic error boundary. Anything else still throws, including a request with no `authenticated`
 * role at all -- with one deliberate exception, stated plainly because an earlier draft of this
 * comment claimed the opposite and a reviewer proved it false by revoking the grant and watching
 * /keys redirect to /login.
 *
 * The exception: guard.ts's fromDatabase maps PostgREST's "permission denied for function" to
 * UNAUTHENTICATED, so it is caught here and redirects. That is on purpose -- a request carrying no
 * session reaches PostgREST as `anon`, and console_me is granted to `authenticated` alone, so this
 * is the ordinary signed-out case and a signed-out visitor needs the sign-in link, not an error
 * page. The cost is real: if console_me's own grant were ever revoked in production, every member
 * would see a sign-out rather than a fault, and nothing would report it. That is judged the better
 * trade -- signed-out requests are constant, a missing grant is a deploy-time mistake CI catches --
 * but it is a trade, not a property. "permission denied for schema console" (the shape 2c's enum
 * bug took) is deliberately NOT mapped and still reaches the error boundary.
 *
 * getMyKeys() and getMySessions(), by contrast, only ever run once requireConsoleMember() has
 * already succeeded, so a failure in either is left to propagate to the console's own error
 * boundary (src/app/console/error.tsx, task 5) rather than a bespoke in-page error state -- the
 * sheet's isError copy ("Your keys didn't load" / "The console couldn't reach its database.") is
 * not in the brief's quoted-copy list, so it is not transcribed here.
 *
 * The two-column layout below (ConsoleMyKeys.dc.html:122-145) was left a single column until now
 * (task-6-addendum.md's own note on profile-plate.tsx: "a rail of fourteen dead links is worse than
 * none" -- the same call, applied to a grid whose second column had nothing to hold yet). Task 9
 * fills it with the Sessions plate.
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
  // One round trip each, run together: getMyKeys's own comment notes it already combines the Keys
  // and Profile plates into one call, and getMySessions is a second, independent read -- there is
  // no data dependency between the two, so they run concurrently rather than one after the other.
  const [{ keys, member: profile }, sessions] = await Promise.all([getMyKeys(), getMySessions()]);

  return (
    <ConsoleFrame member={member}>
      <div className="flex flex-col gap-8">
        <PageHeader kicker={m.kicker} title={m.title} lead={m.lead} />
        <KeysPlate keys={keys} />
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <ProfilePlate member={profile} />
          </div>
          <div className="flex flex-col gap-8">
            <SessionsPlate sessions={sessions} />
          </div>
        </div>
      </div>
    </ConsoleFrame>
  );
}
