"use client";

import Link from "next/link";
import { ErrorSheet } from "@/components/pnr/result-error-sheet";
import { buttonClassName } from "@/components/ui/button";
import { messages } from "@/messages";

export default function PnrError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="page-frame page-body">
      <ErrorSheet
        digest={error.digest}
        onRetry={retry}
        action={
          <Link href="/#terminal" className={buttonClassName({ variant: "secondary" })}>
            {messages.result.back}
          </Link>
        }
      />
    </section>
  );
}
