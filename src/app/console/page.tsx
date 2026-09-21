import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";

/**
 * Ruling (task-5-brief.md, corrected by task-5-addendum.md §4): the frame's no-access state draws
 * "Back to Overview" as a link to Overview, which doesn't exist yet (2f builds it), so that link
 * points at "/" and "/" redirects here, to the one destination that is already correct: /keys.
 * When 2f gives "/" a real Overview page, remove this redirect -- NoAccessState's link
 * (src/console/components/frame-states.tsx) keeps working unchanged, no rename needed.
 *
 * Until then: /keys has no page of its own (task 6 puts My keys there), so a signed-in member
 * landing on "/" falls through to src/app/console/[...missing]/page.tsx's signed-in not-found
 * state rather than Overview -- worse-looking than a redirect loop, but terminal, honest (the page
 * genuinely does not exist yet), and not a placeholder built to cover the gap (task-5-fix-1.md).
 *
 * This used to loop: /keys was also the sign-in key step, which redirected a key-verified session
 * straight back to "/" (src/app/console/setup/page.tsx has the same shape and was the third leg).
 * task-5-fix-1.md moves that step to /sign-in-key instead of deferring the fix to task 6, so a
 * signed-in member hitting "/" -- including by the masthead's own logo link, always visible --
 * settles instead of bouncing forever.
 */
export default function ConsoleHome(): never {
  redirect(consoleHref("/keys"));
}
