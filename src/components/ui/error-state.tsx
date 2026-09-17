import type { ReactNode } from "react";
import { messages } from "@/messages";
import { Button } from "./button";
import { StateBlock } from "./state-block";

export function ErrorState({
  title = messages.states.error.title,
  detail = messages.states.error.detail,
  digest,
  onRetry,
  retryLabel = messages.common.retry,
  actions,
  className,
}: {
  readonly title?: string;
  readonly detail?: ReactNode;
  readonly digest?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  return (
    <StateBlock
      tone="stop"
      title={title}
      detail={detail}
      role="alert"
      className={className}
      actions={
        <>
          {onRetry ? (
            <Button variant="primary" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {actions}
        </>
      }
    >
      {digest ? <p className="font-data text-xs text-ink-3">{messages.states.error.reference(digest)}</p> : null}
    </StateBlock>
  );
}
