import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { messages } from "@/messages";

export const metadata: Metadata = { title: messages.legal.terms.title };

export default function TermsPage() {
  const m = messages.legal.terms;
  return <LegalDocument title={m.title} lead={m.lead} sections={m.sections} />;
}
