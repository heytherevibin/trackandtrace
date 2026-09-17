import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { messages } from "@/messages";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  const m = messages.states.offlinePage;
  return (
    <section className="page-frame page-body">
      <PageHeader title={m.title} lead={m.lead} />
      <UnavailableState className="mt-8" title={m.plateTitle} detail={m.plateDetail} />
    </section>
  );
}
