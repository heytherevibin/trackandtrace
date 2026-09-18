import { Badge } from "@/components/ui/badge";
import { messages } from "@/messages";

// Server-safe pieces shared by the check plates and the landing sheet.

/** Tags as the sheet draws them: 11px on a 1.5 line; the filled tag has no edge, the outline tag a steel one. */
export function SheetTag({ variant, title, children }: { readonly variant: "accent" | "outline"; readonly title?: string; readonly children: string }) {
  return (
    <Badge variant={variant} title={title}>
      {children}
    </Badge>
  );
}

/** "Third-party": the RapidAPI source's label, with its hover note naming the provider. */
export function ThirdPartyTag() {
  return (
    <SheetTag variant="outline" title={messages.common.thirdPartyHint}>
      {messages.common.thirdParty}
    </SheetTag>
  );
}

/** "Sample data": the fixture label, with its hover note. */
export function SampleTag() {
  return (
    <SheetTag variant="outline" title={messages.common.sampleDataHint}>
      {messages.common.sampleData}
    </SheetTag>
  );
}
