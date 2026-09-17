import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { StateBlock } from "@/components/ui/state-block";
import { messages } from "@/messages";

export function SourceNotFound() {
  const m = messages.states.notFound;
  return (
    <StateBlock
      tone="watch"
      title={m.title}
      detail={m.detail}
      role="status"
      live="polite"
      actions={
        <Link href="/" className={buttonClassName({ variant: "primary" })}>
          {messages.result.back}
        </Link>
      }
    />
  );
}
