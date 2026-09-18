import Link from "next/link";
import { headers } from "next/headers";
import { PnrResultView } from "@/components/pnr/pnr-result-view";
import { RefreshButton } from "@/components/pnr/refresh-button";
import { UnavailableLifecycle } from "@/components/pnr/result-lifecycle";
import { SourceNotFound } from "@/components/pnr/source-not-found";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StateBlock } from "@/components/ui/state-block";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { messages } from "@/messages";
import { activePnrSource } from "@/services/env";
import { queryPnr } from "@/services/pnr-query";
import { clientIp } from "@/services/rate-limit";
import { formatPnr } from "@/utils/pnr";

/** Server component: one shared query, then the honest state for its outcome. */
export async function PnrResultLoader({ pnr }: { readonly pnr: string }) {
  const h = await headers();
  const out = await queryPnr(pnr, clientIp(null, h.get("x-forwarded-for")));
  if (out.ok) {
    return <PnrResultView pnr={pnr} initial={{ result: out.result, cached: out.cached, latencyMs: out.latencyMs }} />;
  }

  const m = messages.result;
  const header = <PageHeader back={{ href: "/#terminal", label: m.back }} title={m.pnr(formatPnr(pnr))} />;
  const checkAnother = (
    <Link href="/#terminal" className={buttonClassName({ variant: "secondary" })}>
      {m.back}
    </Link>
  );

  if (out.error.code === "NOT_FOUND") {
    return (
      <>
        {header}
        <SourceNotFound className="mt-8" pnr={pnr} source={activePnrSource()} retrievedAt={new Date()} />
      </>
    );
  }

  if (out.error.code === "RATE_LIMITED") {
    const r = messages.states.rateLimited;
    return (
      <>
        {header}
        <StateBlock
          className="mt-8"
          tone="stop"
          title={r.title}
          detail={r.detail}
          role="alert"
          actions={
            <>
              <RefreshButton retryAfter={out.error.retryAfter ?? 60} />
              {checkAnother}
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <UnavailableState
        className="mt-8"
        detail={out.error.message}
        actions={
          <>
            <RefreshButton />
            {checkAnother}
            <Link href="/accuracy" className={buttonClassName({ variant: "ghost" })}>
              {messages.states.unavailable.policyLink}
            </Link>
          </>
        }
      />
      <UnavailableLifecycle className="mt-[28px]" pnr={pnr} />
    </>
  );
}
