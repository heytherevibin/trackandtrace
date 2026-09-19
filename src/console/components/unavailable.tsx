import { Led } from "@/components/ui/led";
import { Plate } from "@/components/ui/plate";
import type { ConsoleAvailability } from "@/console/availability";
import { consoleMessages } from "@/console/messages";
import { SignedOutFrame } from "./signed-out-frame";

const m = consoleMessages.availability;

/** Shown instead of any console page where the console must not run (spec 3A). */
export function Unavailable({ reason }: { readonly reason: Exclude<ConsoleAvailability, "available"> }) {
  return (
    <SignedOutFrame>
      <Plate title={m.plate} titleId="console-unavailable-plate" headingLevel={1} cells="tight" padding="none" bodyClassName="px-4 py-5 sm:p-6">
        <p className="flex items-center gap-2.5 text-sm text-ink-1">
          <Led />
          {reason === "production-only" ? m.productionOnly : m.localDatabase}
        </p>
      </Plate>
    </SignedOutFrame>
  );
}
