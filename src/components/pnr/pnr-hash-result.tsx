"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import type { PublicPnrSource } from "@/types/domain";
import { formatPnr, pnrFromHash } from "@/utils/pnr";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StateBlock } from "@/components/ui/state-block";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { PnrResultSkeleton } from "./pnr-result-skeleton";
import { PnrResultView, type PnrResultInitial } from "./pnr-result-view";
import { RefreshButton } from "./refresh-button";
import { CheckAgainSheet } from "./result-check-again";
import { UnavailableLifecycle } from "./result-lifecycle";
import { SourceNotFound } from "./source-not-found";

// The result page body. The PNR lives after "#" in the address, which browsers never send to a
// server, and is asked for with POST /api/pnr, so it never lands in a path, a query string or a
// request log. The server renders only the shell; everything below depends on the hash.

type View =
  | { readonly kind: "ok"; readonly initial: PnrResultInitial }
  | { readonly kind: "notfound"; readonly at: Date }
  | { readonly kind: "limited"; readonly retryAfter: number }
  | { readonly kind: "unavailable"; readonly message: string };

interface Answer {
  /** Which request this answers: the PNR and the attempt, so a stale reply never shows. */
  readonly key: string;
  readonly view: View;
}

/** hashchange covers typed and linked hashes; popstate covers back and forward across router entries. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}
const readHash = (): string | null => window.location.hash;
/** The server has no hash: render the skeleton until the browser reads it. */
const noHashOnServer = (): string | null => null;

function viewFor({ outcome, cached, latencyMs }: Awaited<ReturnType<typeof fetchPnr>>): View {
  if (outcome.ok) return { kind: "ok", initial: { result: outcome.result, cached, latencyMs } };
  if (outcome.code === "NOT_FOUND") return { kind: "notfound", at: new Date() };
  if (outcome.code === "RATE_LIMITED") return { kind: "limited", retryAfter: outcome.retryAfter ?? 60 };
  return { kind: "unavailable", message: outcome.message };
}

export function PnrHashResult({ source }: { readonly source: PublicPnrSource }) {
  const hash = useSyncExternalStore(subscribe, readHash, noHashOnServer);
  const pnr = hash === null ? null : pnrFromHash(hash);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const key = pnr ? `${pnr}:${attempt}` : null;

  useEffect(() => {
    if (!pnr || !key) return;
    let live = true;
    void fetchPnr(pnr, { fresh: attempt > 0 }).then((out) => {
      if (live) setAnswer({ key, view: viewFor(out) });
    });
    return () => {
      live = false;
    };
  }, [pnr, attempt, key]);

  useEffect(() => {
    if (pnr) document.title = `${messages.result.pnr(formatPnr(pnr))} · ${messages.common.productName}`;
  }, [pnr]);

  if (hash === null) return <PnrResultSkeleton />;
  if (!pnr) {
    const m = messages.states.notFoundPage;
    return <CheckAgainSheet title={m.pnrTitle} detail={m.pnrDetail} autoFocus />;
  }
  if (!answer || answer.key !== key) return <PnrResultSkeleton />;

  const { view } = answer;
  if (view.kind === "ok") return <PnrResultView key={pnr} pnr={pnr} initial={view.initial} />;

  const m = messages.result;
  const retry = () => setAttempt((n) => n + 1);
  const header = <PageHeader back={{ href: "/#terminal", label: m.back }} title={m.pnr(formatPnr(pnr))} />;
  const checkAnother = (
    <Link href="/#terminal" className={buttonClassName({ variant: "secondary" })}>
      {m.back}
    </Link>
  );

  if (view.kind === "notfound") {
    return (
      <>
        {header}
        <SourceNotFound className="mt-8" pnr={pnr} source={source} retrievedAt={view.at} />
      </>
    );
  }

  if (view.kind === "limited") {
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
              <RefreshButton retryAfter={view.retryAfter} onRefresh={retry} />
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
        detail={view.message}
        actions={
          <>
            <RefreshButton onRefresh={retry} />
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
