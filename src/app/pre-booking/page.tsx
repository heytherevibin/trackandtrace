import type { Metadata } from "next";
import { messages } from "@/messages";
import { PreBookingForm } from "./pre-booking-form";

export const metadata: Metadata = { title: messages.booking.title };

/**
 * Pre-booking B: the 60ch title block, then Form TL-02, the honest result, and the lifecycle.
 * Headings wrap "pretty" as the sheet's do (base.css balances h1–h4, which breaks lines differently).
 */
export default function PreBookingPage() {
  const m = messages.booking;
  return (
    <section className="page-frame page-body">
      <div className="max-w-[60ch]">
        <h1 className="optical-hang text-page tracking-display text-pretty">{m.title}</h1>
        <p className="mt-3.5 text-base text-ink-1/78">{m.lead}</p>
      </div>
      <PreBookingForm />
    </section>
  );
}
