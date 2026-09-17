import type { Metadata } from "next";
import { messages } from "@/messages";
import { currentUserFrom } from "@/services/session";
import { createServerSupabase } from "@/services/supabase/server";
import { listEntries } from "@/services/watchlist-repo";
import type { WatchlistEntry } from "@/types/domain";
import { WatchlistView } from "./watchlist-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: messages.watchlist.title };

export default async function WatchlistPage() {
  const db = await createServerSupabase();
  const user = db ? await currentUserFrom(db) : null;
  let initial: readonly WatchlistEntry[] = [];
  let loadError = false;
  if (db && user) {
    try {
      initial = await listEntries(db, user.id);
    } catch {
      loadError = true;
    }
  }
  return <WatchlistView signedIn={user !== null} initialEntries={initial} loadError={loadError} />;
}
