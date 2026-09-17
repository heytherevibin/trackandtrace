import type { ReactNode } from "react";
import { messages } from "@/messages";
import { KeyValueList } from "./key-value-list";
import { StateBlock } from "./state-block";

// The honesty grammar. Every unavailable result names what was received, where
// it came from, and that nothing was substituted.

export function UnavailableState({
  title = messages.states.unavailable.title,
  detail = messages.states.unavailable.detail,
  response = messages.states.unavailable.responseValue,
  provenance = messages.states.unavailable.provenanceValue,
  fallback = messages.states.unavailable.fallbackValue,
  actions,
  className,
}: {
  readonly title?: string;
  readonly detail?: ReactNode;
  readonly response?: string;
  readonly provenance?: string;
  readonly fallback?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  const m = messages.states.unavailable;
  return (
    <StateBlock tone="watch" title={title} detail={detail} actions={actions} role="status" live="polite" className={className}>
      <KeyValueList
        dense
        items={[
          { label: m.responseLabel, value: response },
          { label: m.provenanceLabel, value: provenance },
          { label: m.fallbackLabel, value: fallback },
        ]}
      />
    </StateBlock>
  );
}
