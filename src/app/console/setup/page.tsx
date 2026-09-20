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
 */
export default async function ConsoleSetupPage({ searchParams }: { readonly searchParams: Promise<{ readonly token?: string | readonly string[] }> }) {
  const { token: rawToken } = await searchParams;
  const token = typeof rawToken === "string" ? rawToken : null;

  if (token) {
    return (
      <SignedOutFrame>
        <RedeemToken token={token} />
      </SignedOutFrame>
    );
  }

  const session = await requireLinkSession().catch(() => null);
  if (!session) redirect(consoleHref("/login"));
  if (session.keyCount >= 2) redirect(consoleHref("/"));

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
