import type { Metadata } from "next";
import { messages } from "@/messages";
import { currentUserFrom } from "@/services/session";
import { createServerSupabase } from "@/services/supabase/server";
import { listEntries } from "@/services/watchlist-repo";
import { AccountView } from "./account-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: messages.account.title };

export default async function AccountPage() {
  const db = await createServerSupabase();
  const user = db ? await currentUserFrom(db) : null;
  const savedCount = db && user ? await listEntries(db, user.id).then((list) => list.length).catch(() => 0) : 0;
  return <AccountView user={user} savedCount={savedCount} />;
}
