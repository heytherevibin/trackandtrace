import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/mark";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleHref } from "@/console/href";
import { requireLinkSession } from "@/console/keys/ceremony";
import { consoleMessages } from "@/console/messages";
import { RedeemToken } from "./redeem-token";
import { SetupFlow } from "./setup-flow";

const m = consoleMessages.setup;

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: m.pageTitle };

/**
 * Setup (Form TC-03), First Owner entry only -- Team's Invite states are drawn but unreachable
 * until the next PR. A `token` in the URL is the one-time link out of the SQL editor, redeemed
 * server to server with no email at all; without one, this is where a fresh link session lands.
 *
 * The session is checked *before* the token, not after: `create_first_owner_link` is deliberately
 * free to issue more than one link (losing one before redemption is a real scenario), so a second,
 * still-live link can be opened in a browser that already redeemed a different one. Redeeming it
 * again would overwrite that live cookie with a fresh `verifyOtp`, fail (the console now has an
 * Owner), and sign the fresh cookie back out -- taking the member's real session down with it,
 * globally, since Supabase's own sign-out defaults to every session on the account. Checking for a
 * session first means an already-signed-in browser never calls /api/setup at all.
 */
export default async function ConsoleSetupPage({ searchParams }: { readonly searchParams: Promise<{ readonly token?: string | readonly string[] }> }) {
  const session = await requireLinkSession().catch(() => null);
  if (session) {
    // The keys-cleared recovery path (docs/runbooks/console-keys.md) leaves an active member's
    // session not key-verified even once they hold two keys again -- adding a key key-verifies a
    // session only for the member it activates (ceremony.ts's justActivated), which an already-active
    // member never is. Sending them to "/" here would just bounce off requireConsoleMember's own
    // key-verified check with no explanation; /sign-in-key is the tap step built for exactly this
    // session shape (two-plus keys, not yet key-verified).
    if (session.keyCount >= 2) redirect(consoleHref(session.keyVerified ? "/" : "/sign-in-key"));
    return (
      <SignedOutFrame>
        <span className="inline-flex">
          <Mark size={40} />
        </span>
        <h1 className="optical-hang mt-6 text-5xl tracking-display">{m.title}</h1>
        <p className="mt-3.5 text-base text-ink-2">{m.lead}</p>
        <div className="mt-8">
          <SetupFlow keyCount={session.keyCount} />
        </div>
      </SignedOutFrame>
    );
  }

  const { token: rawToken } = await searchParams;
  const token = typeof rawToken === "string" ? rawToken : null;
  if (token) {
    return (
      <SignedOutFrame>
        <RedeemToken token={token} />
      </SignedOutFrame>
    );
  }

  redirect(consoleHref("/login"));
}
