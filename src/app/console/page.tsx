import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";

/**
 * Ruling (task-5-brief.md, corrected by task-5-addendum.md §4): the frame's no-access state draws
 * "Back to Overview" as a link to Overview, which doesn't exist yet (2f builds it), so that link
 * points at "/" and "/" redirects here, to the one destination that is already correct: /keys.
 * When 2f gives "/" a real Overview page, remove this redirect -- NoAccessState's link
 * (src/console/components/frame-states.tsx) keeps working unchanged, no rename needed.
 *
 * Until then (task-5-addendum.md §4): /keys is still the sign-in key step, not My keys (task 6
 * moves it), so a signed-in member landing on "/" sees that page rather than Overview. That is a
 * known, accepted window inside an unmerged branch, not a bug this redirect should route around.
 */
export default function ConsoleHome(): never {
  redirect(consoleHref("/keys"));
}
