import type { ReactNode } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { messages } from "@/messages";

/** The error grammar on an app sheet: the title block, then the alert plate with its reference and a retry. */
export function ErrorSheet({ digest, onRetry, action }: { readonly digest?: string; readonly onRetry: () => void; readonly action?: ReactNode }) {
  const m = messages.states.error;
  return (
    <>
      <PageHeader title={m.title} lead={m.detail} />
      <ErrorState className="mt-8" title={m.plateTitle} detail={m.plateDetail} digest={digest} onRetry={onRetry} actions={action} />
    </>
  );
}
