"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { messages } from "@/messages";

export default function PnrError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="mx-auto w-full max-w-prose px-4 py-12 sm:px-6">
      <ErrorState
        digest={error.digest}
        onRetry={retry}
        actions={
          <Link href="/" className={buttonClassName({ variant: "secondary" })}>
            {messages.result.back}
          </Link>
        }
      />
    </section>
  );
}
