import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { messages } from "@/messages";
import { PreBookingForm } from "./pre-booking-form";

export const metadata: Metadata = { title: messages.booking.title };

export default function PreBookingPage() {
  const m = messages.booking;
  return (
    <section className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-8 sm:px-6">
      <PageHeader title={m.title} lead={m.lead} />
      <PreBookingForm />
    </section>
  );
}
