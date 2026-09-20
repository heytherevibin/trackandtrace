import type { MessageTree } from "@/messages/types";

// Where the console refuses to run (spec 3A): previews and local servers use the production database.
export const availability = {
  plate: "Console",
  productionOnly: "The console runs only in production.",
  localDatabase: "Point the app at a local Supabase to use the console.",
} as const satisfies MessageTree;
