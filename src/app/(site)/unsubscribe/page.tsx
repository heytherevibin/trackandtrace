import type { Metadata } from "next";
import { z } from "zod";
import { NOTE, Status } from "@/components/subscribe/plate-parts";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { messages } from "@/messages";
import { unsubscribeKey, verifyUnsubscribe } from "@/services/subscriptions/links";
import { UnsubscribeClient } from "./unsubscribe-client";

export const dynamic = "force-dynamic";
// An unsubscribe link belongs to one person, and a search engine has no business holding it.
export const metadata: Metadata = { title: messages.subscribe.page.unsubscribe.headline, robots: { index: false } };

// The route's own shapes: a link that could not post is not offered a button that would only 400.
const LINK = z.object({
  p: z.uuid(),
  l: z.enum(["news", "availability"]),
  s: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const m = messages.subscribe.page;

export default async function UnsubscribePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const link = LINK.safeParse({ p: params.p, l: params.l, s: params.s });

  // The signature is the permission: there is no token and no expiry, so it verifies or it does not.
  // Opening the link only ever draws this page; nothing is written until the button in the client.
  if (link.success && verifyUnsubscribe(unsubscribeKey(), link.data.p, link.data.l, link.data.s)) {
    return (
      <UnsubscribeClient
        headline={m.unsubscribe.headline}
        lead={m.unsubscribe.lead}
        promise={m.leaving[link.data.l]}
        person={link.data.p}
        list={link.data.l}
        signature={link.data.s}
      />
    );
  }
  return (
    <SubscriptionPage headline={m.unsubscribe.headline}>
      <Status>{m.invalid.title}</Status>
      <p className={NOTE}>{m.invalid.note}</p>
    </SubscriptionPage>
  );
}
