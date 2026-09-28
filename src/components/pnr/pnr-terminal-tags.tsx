import { Badge } from "@/components/ui/badge";
import { messages } from "@/messages";

// Server-safe pieces shared by the check plates and the landing sheet.

/** Tags as the sheet draws them: 11px on a 1.5 line; the filled tag has no edge, the outline tag a steel one. */
/** `wrap`: the tag's words may wrap inside its box when the line is too short for them (its text at 200% on a phone). */
export function SheetTag({ variant, title, wrap = false, children }: { readonly variant: "accent" | "outline"; readonly title?: string; readonly wrap?: boolean; readonly children: string }) {
  return (
    <Badge variant={variant} title={title} className={wrap ? "whitespace-normal" : undefined}>
      {children}
    </Badge>
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
