import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AccountView } from "@/app/(site)/account/account-view";
import { SessionProvider } from "@/components/session/session-provider";
import { UserMenu } from "@/components/shell/user-menu";
import { env } from "@/services/env";
import { isSupabaseConfigured } from "@/services/supabase/public-env";
import type { SessionUser } from "@/types/session";

export const metadata: Metadata = { title: "Signed in", robots: { index: false, follow: false } };

/** A long name and address, so a line that cannot hold them shows it: the drawing never cuts either short. */
const TRAVELLER: SessionUser = {
  id: "e2e-traveller",
  email: "venkataramanan.subramanian@example.co.in",
  name: "Venkataramanan Subramanian",
  avatarUrl: null,
};

/**
 * The account view and the account menu as a signed-in traveller sees them, for the nightly's 200% text sweep: the
 * fixture-mode run has no accounts, so nothing else can draw them. The menu stands where the masthead holds it, at the
 * frame's right edge; it opens the same popup.
 *
 * Only on Playwright's own server: E2E=1, which the environment check refuses in production (src/services/env.ts), and
 * no accounts configured, so the view's Sign out, Export and Delete can never reach a real account. A 404 everywhere
 * else, never indexed (robots.ts, next.config.ts). It reads no session and no store: its traveller is the constant
 * above, and nothing here signs anyone in.
 */
export default async function SignedInFixturePage() {
  await connection();
  if (!env().E2E || isSupabaseConfigured()) notFound();
  return (
    <SessionProvider userPromise={Promise.resolve(TRAVELLER)}>
      <div className="page-frame flex min-h-16 items-center justify-end">
        <UserMenu />
      </div>
      <AccountView user={TRAVELLER} savedCount={3} />
    </SessionProvider>
  );
}
