"use client";

import { ErrorState } from "@/components/ui/error-state";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.frame.states.error;

/**
 * Main.dc.html's pageError state (task-5-brief.md's table): "This page didn't load" / "The console
 * couldn't reach its data.", with the server's own digest as the reference line -- ErrorState
 * already renders exactly the sheet's "Reference …" line when given one, and nothing when not
 * (task-5-addendum.md §1, which replaces the brief's instruction to generate a random one). Matches
 * the shape of src/app/(site)/error.tsx and src/app/(site)/pnr/error.tsx, its two named precedents.
 *
 * Error boundaries must be Client Components, so unlike a page's own content this cannot call
 * headers() or requireConsoleMember() and so cannot sit inside ConsoleFrame's masthead and rail --
 * the same constraint those two precedents already live with (neither renders inside the site's own
 * header for the same reason, even though their layout would otherwise keep it mounted).
 */
export default function ConsoleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <ErrorState title={m.title} detail={m.detail} digest={error.digest} onRetry={retry} className="w-full max-w-[720px]" />
    </div>
  );
}
