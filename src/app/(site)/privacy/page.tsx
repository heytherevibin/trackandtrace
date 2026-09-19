import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { messages } from "@/messages";

export const metadata: Metadata = { title: messages.legal.privacy.title };

export default function PrivacyPage() {
  const m = messages.legal.privacy;
  return <LegalDocument title={m.title} lead={m.lead} sections={m.sections} />;
}
