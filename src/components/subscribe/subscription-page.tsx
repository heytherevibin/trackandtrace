import type { ReactNode } from "react";
import { Mark } from "@/components/brand/mark";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";

// The shell both subscription pages draw: the mark, a 520px column, the plate the page's own body
// sits in, and the closing line. The (site) layout supplies the page chrome and the footer.
// The lead belongs to the state before the press, so when there is none no paragraph is drawn.

export function SubscriptionPage({
  headline,
  lead,
  children,
}: {
  readonly headline: string;
  readonly lead?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[520px] px-[24px] pb-20 pt-[clamp(40px,7vw,80px)]">
      <Mark size={40} />
      <h1 className="optical-hang mt-6 text-signin tracking-display">{headline}</h1>
      {lead ? <p className="mt-3 text-base text-ink-1/78">{lead}</p> : null}
      <div className="blueprint mt-8">
        <Corners />
        <div className="p-[24px]">{children}</div>
      </div>
      <p className="mt-6 text-sm text-ink-1/74">{messages.subscribe.page.closing}</p>
    </section>
  );
}
