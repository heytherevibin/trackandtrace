import type { NewsStatus } from "@/console/leads/filters";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.leads.news;

// Five statuses, five forms, ONE box (sheet 22, decided at its review): every tag carries a 1px
// edge, clear unless the form is an outline, so no status is taller or set wider than another.
// Suppressed is the solid one, in the alert ink: it is the status that means mail cannot reach them.
const FORM: Readonly<Record<NewsStatus, string>> = {
  subscribed: "border-transparent bg-accent-soft text-accent-soft-ink",
  pending: "border-accent-text text-accent-text",
  unsubscribed: "border-transparent bg-surface-1 text-ink-2",
  suppressed: "border-ink-alert bg-ink-alert text-ink-inverse",
  none: "border-line-strong text-ink-2",
};

/** Where someone stands with the News list. "Not subscribed" is a tag like the rest, never plain text. */
export function NewsTag({ status }: { readonly status: NewsStatus }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap border px-2.5 py-[3px] text-2xs leading-normal tracking-head", FORM[status])}>{m[status]}</span>;
}
