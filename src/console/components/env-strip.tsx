import { Badge } from "@/components/ui/badge";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.frame.environment;

/**
 * The environment strip, 28px, always visible. Production is a hairline rule with a filled tag, and Preview a dashed
 * rule with an outline tag: shape and word differ, never colour (B0).
 */
export function EnvStrip({ production, host }: { readonly production: boolean; readonly host: string }) {
  return (
    <div className={cn("flex h-7 shrink-0 items-center gap-2 border-b px-4 sm:gap-2.5 sm:px-6", production ? "border-line" : "border-dashed border-line-strong")}>
      <Badge variant={production ? "accent" : "steel"} caps>
        {production ? m.production : m.preview}
      </Badge>
      <span className="legend-md max-sm:legend-sm min-w-0 truncate">{production ? host : m.previewHost(host)}</span>
    </div>
  );
}
