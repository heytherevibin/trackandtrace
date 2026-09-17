import Link from "next/link";
import { headers } from "next/headers";
import { PnrResultView } from "@/components/pnr/pnr-result-view";
import { RefreshButton } from "@/components/pnr/refresh-button";
import { SourceNotFound } from "@/components/pnr/source-not-found";
import { buttonClassName } from "@/components/ui/button";
import { StateBlock } from "@/components/ui/state-block";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { messages } from "@/messages";
import { queryPnr } from "@/services/pnr-query";
import { clientIp } from "@/services/rate-limit";

/** Server component: one shared query, then the honest state for its outcome. */
export async function PnrResultLoader({ pnr }: { readonly pnr: string }) {
  const h = await headers();
  const out = await queryPnr(pnr, clientIp(null, h.get("x-forwarded-for")));
  if (out.ok) {
    return <PnrResultView pnr={pnr} initial={{ result: out.result, cached: out.cached, latencyMs: out.latencyMs }} />;
  }
  const home = (
    <Link href="/" className={buttonClassName({ variant: "secondary" })}>
      {messages.result.back}
    </Link>
  );
  if (out.error.code === "NOT_FOUND") return <SourceNotFound />;
  if (out.error.code === "RATE_LIMITED") {
    const m = messages.states.rateLimited;
    return (
      <StateBlock tone="stop" title={m.title} detail={m.detail} role="alert" actions={<><RefreshButton retryAfter={out.error.retryAfter ?? 60} />{home}</>} />
    );
  }
  return (
    <UnavailableState
      detail={out.error.message}
      actions={
        <>
          <RefreshButton />
          {home}
          <Link href="/accuracy" className={buttonClassName({ variant: "ghost" })}>
            {messages.states.unavailable.policyLink}
          </Link>
        </>
      }
    />
  );
}
