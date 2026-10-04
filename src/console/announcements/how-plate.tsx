import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.announcements.how;

/**
 * "How a letter goes out" (ConsoleAnnouncements.dc.html:161-170): the four rules, beside Compose.
 * `titleId` is the caller's because the page draws this twice, once per width, and two elements
 * must not share an id even when one is hidden.
 */
export function HowPlate({ titleId }: { readonly titleId: string }) {
  return (
    <Plate as="section" title={m.title} titleId={titleId} headingLevel={2} padding="none">
      <ul className="text-ink-2 flex list-disc flex-col gap-2 py-4 pl-8 pr-5 text-sm">
        {m.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Plate>
  );
}
