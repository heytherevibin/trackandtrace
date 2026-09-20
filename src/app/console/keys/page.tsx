import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mark } from "@/components/brand/mark";
import { SignedOutFrame } from "@/console/components/signed-out-frame";
import { consoleHref } from "@/console/href";
import { requireLinkSession } from "@/console/keys/ceremony";
import { consoleMessages } from "@/console/messages";
import { KeyStep } from "./key-step";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your key" };

/**
 * Step 3 of spec §C. Reaching this page means the link was opened and a console session exists;
 * it is not key-verified yet, so nothing else in the console is reachable from here.
 */
export default async function ConsoleKeysPage() {
  const session = await requireLinkSession().catch(() => null);
  if (!session) redirect(consoleHref("/login"));
  if (session.keyCount < 2) redirect(consoleHref("/setup"));
  if (session.keyVerified) redirect(consoleHref("/"));

  return (
    <SignedOutFrame>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 className="optical-hang mt-6 text-5xl tracking-display">{consoleMessages.keys.title}</h1>
      <p className="mt-3.5 text-base text-ink-2">{consoleMessages.keys.lead}</p>
      <div className="mt-8">
        <KeyStep />
      </div>
    </SignedOutFrame>
  );
}
