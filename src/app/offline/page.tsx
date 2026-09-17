import type { Metadata } from "next";
import { StateBlock } from "@/components/ui/state-block";
import { messages } from "@/messages";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <section className="mx-auto w-full max-w-prose px-4 py-12 sm:px-6">
      <StateBlock tone="watch" title={messages.states.offline} role="status" live="polite" />
    </section>
  );
}
