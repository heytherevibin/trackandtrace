import type { ReactNode } from "react";
import { messages } from "@/messages";
import { Button, type ButtonVariant } from "./button";
import { StateBlock } from "./state-block";

export function ErrorState({
  title = messages.states.error.title,
  detail = messages.states.error.detail,
  digest,
  onRetry,
  retryVariant = "primary",
  retryLabel = messages.common.retry,
  actions,
  headingLevel,
  className,
}: {
  readonly title?: string;
  readonly detail?: ReactNode;
  readonly digest?: string;
  readonly onRetry?: () => void;
  /**
   * Filled, as the traveller sheets draw Retry (docs/design/sheets/traveller/Errors.dc.html's own
   * accent-strong button). The console draws the same button outline instead -- all eight console
   * sheets that show Retry use btn-secondary -- so console callers pass "secondary".
   */
  readonly retryVariant?: ButtonVariant;
  readonly retryLabel?: string;
  readonly actions?: ReactNode;
  readonly headingLevel?: 1 | 2 | 3;
  readonly className?: string;
}) {
  return (
    <StateBlock
      tone="stop"
      title={title}
      detail={detail}
      role="alert"
      headingLevel={headingLevel}
      className={className}
      actions={
        onRetry || actions ? (
          <>
            {onRetry ? (
              <Button variant={retryVariant} onClick={onRetry}>
                {retryLabel}
              </Button>
            ) : null}
            {actions}
          </>
        ) : undefined
      }
    >
      {digest ? <p className="legend-sm tnum">{messages.states.error.reference(digest)}</p> : null}
    </StateBlock>
  );
}
