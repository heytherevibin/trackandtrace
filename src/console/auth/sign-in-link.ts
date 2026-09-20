import { createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { sendConsoleEmail } from "@/console/email/send";
import { consoleMessages } from "@/console/messages";
import { log } from "@/services/log";

/**
 * Where the link goes, given this request's console origin (scheme and host together, as
 * `consoleOrigin` builds it -- this function no longer decides the scheme itself). `generateLink`
 * also hands back an `action_link`, but that one points at Supabase's own /auth/v1/verify, which
 * finishes by putting the tokens in the URL *fragment* -- which a server route never sees. We send
 * `hashed_token` to our own confirm route instead, the same shape the traveller callback already
 * handles.
 */
export function confirmUrl(origin: string, tokenHash: string): string {
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
}

/**
 * One sign-in link, for a member only. Everything here happens after the route has already
 * answered (spec §C: one answer for every address, and §3A: equal in time), so nothing it does
 * -- including doing nothing at all -- can be measured from outside. It never throws.
 *
 * `origin` must already be `consoleOrigin`'s output -- checked against this environment's console
 * host, and the production constant rather than a header in production. An empty origin means the
 * request's host did not check out, so nothing is sent: a member-facing link is never assembled
 * from input that hasn't been checked.
 */
export async function sendSignInLink(email: string, origin: string, db?: ConsoleDb): Promise<void> {
  try {
    if (!origin) {
      log.warn("[console] refused to send a sign-in link: the request's host did not check out");
      return;
    }
    const client = db ?? createConsoleServiceDb();
    const { data, error } = await client.rpc("console_auth_member_by_email", { p_email: email });
    if (error) {
      log.warn("[console] member lookup failed while sending a sign-in link", error.message);
      return;
    }
    const member = data as { name?: unknown; status?: unknown } | null;
    if (!member || typeof member.name !== "string" || member.status === "removed") return;

    const link = await client.auth.admin.generateLink({
      type: "magiclink",
      email,
      // Token-less: generateLink only checks this against Supabase's own redirect allow-list. The
      // link we actually send is built again below, once the real hashed_token exists.
      options: { redirectTo: confirmUrl(origin, "") },
    });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      log.warn("[console] could not mint a sign-in link", link.error?.message ?? "no token");
      return;
    }

    const letter = consoleMessages.email.signIn({ name: member.name, link: confirmUrl(origin, tokenHash) });
    const outcome = await sendConsoleEmail({ to: email, ...letter });
    if (outcome === "failed") log.warn("[console] a sign-in link could not be sent");
  } catch (err) {
    // Spec §5: Resend down, Supabase down -- sign-in answers the same, and the failure is logged.
    log.warn("[console] sending a sign-in link failed", err);
  }
}
