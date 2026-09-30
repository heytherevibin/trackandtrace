import type { Metadata } from "next";
import { z } from "zod";
import { NOTE, Status } from "@/components/subscribe/plate-parts";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { messages } from "@/messages";
import { peekRow } from "@/services/subscriptions/store";
import { tokenHash } from "@/services/subscriptions/subscribe";
import { ConfirmClient } from "./confirm-client";

export const dynamic = "force-dynamic";
// A confirm link belongs to one person, and a search engine has no business holding it.
export const metadata: Metadata = { title: messages.subscribe.page.confirm.headline, robots: { index: false } };

const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const m = messages.subscribe.page;

export default async function ConfirmPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = TOKEN.safeParse(typeof raw === "string" ? raw : "");
  // A token that is not one never reaches the database, and an absent one is the same case. The page
  // only ever peeks: mail clients and link scanners follow links, so opening this URL changes nothing.
  // Only the button, in the client, confirms.
  const peeked = token.success ? await peekRow(tokenHash(token.data)) : { state: "invalid", list: null };
  const list = peeked.list === "availability" ? "availability" : "news";

  // The peek's `confirmed` means the link is good and has NOT been used, so it draws the Before state.
  // (The confirm route answers `confirmed` too, and there it means the opposite; the client reads that.)
  if (token.success && peeked.state === "confirmed") {
    return (
      <ConfirmClient
        view="before"
        headline={m.confirm.headline}
        lead={m.confirm.lead}
        token={token.data}
        promise={messages.subscribe.promise[list]}
      />
    );
  }
  if (peeked.state === "already") {
    return (
      <SubscriptionPage headline={m.confirm.headline}>
        <Status>{m.confirm.already}</Status>
      </SubscriptionPage>
    );
  }
  if (peeked.state === "expired") {
    return <ConfirmClient view="expired" headline={m.confirm.headline} list={list} />;
  }
  // `invalid`, and anything the database might say that this page does not know.
  return (
    <SubscriptionPage headline={m.confirm.headline}>
      <Status>{m.invalid.title}</Status>
      <p className={NOTE}>{m.invalid.note}</p>
    </SubscriptionPage>
  );
}
