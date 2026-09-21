"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Mark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { Led } from "@/components/ui/led";
import { PlateHeader } from "@/components/ui/plate";
import { SweepBar } from "@/components/ui/sweep-bar";
import { consoleApiMessage } from "@/console/api-message";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import type { InviteTokenLookup } from "@/console/setup/redeem";
import { apiRequest } from "@/services/api-client";

const m = consoleMessages.setup;
const REDEEMED = z.object({ ok: z.literal(true), kind: z.enum(["owner", "invite"]) });

// /api/setup runs the link lookup, createUser, generateLink, verifyOtp, the redeem RPC and
// startConsoleSession in sequence -- six-odd round trips to Supabase, not the one or two apiRequest's
// 8-second default assumes. A timeout here does not just fail the request: it can land after the
// link was already spent, so the member sees a failure with no way to tell whether it also worked.
// An invite's own accept path (Task 2b) is a few round trips shorter, but shares the same budget.
const REDEEM_TIMEOUT_MS = 20_000;

function redeem(token: string) {
  return apiRequest(
    "/api/setup",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) },
    REDEEMED,
    { timeoutMs: REDEEM_TIMEOUT_MS },
  );
}

/** Focuses the plate's own heading once, on mount -- the one thing every state below shares. */
function useHeadingFocus() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

/**
 * The one-time link out of the Supabase SQL editor (spec: no invite, no email -- opening it is the
 * whole credential). Redeems it once against /api/setup, then hands off to the plain /setup route,
 * which finds the new link session and renders SetupFlow from there. Unchanged by Task 2b.
 */
function RedeemOwnerLink({ token }: { readonly token: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<{ readonly kind: "working" } | { readonly kind: "failed"; readonly message: string }>({ kind: "working" });
  const headingRef = useHeadingFocus();
  // Strict Mode double-invokes effects in development; this token is single-use, so a second
  // attempt in the same mount must never fire a second request.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void (async () => {
      const result = await redeem(token);
      if (result.ok) {
        router.replace(consoleHref("/setup"));
        return;
      }
      setStage({ kind: "failed", message: consoleApiMessage(result.error) });
    })();
  }, [token, router]);

  return (
    <>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="optical-hang mt-6 text-5xl tracking-display outline-none">
        {m.title}
      </h1>
      <p className="mt-3.5 text-base text-ink-2">{m.lead}</p>
      <div className="mt-8 blueprint">
        <Corners />
        {stage.kind === "working" ? <SweepBar /> : null}
        <PlateHeader meta={[m.form]} cells="tight" stack={false} />
        <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
          {stage.kind === "failed" ? (
            <p role="alert" className="text-label font-medium text-ink-alert">
              {stage.message}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * A live invite (Task 2b): "the invited member's one action", never fired on its own -- opening a
 * mailed link must not, by itself, send mail on the member's behalf (a scanner or a prefetch could
 * open it first). Accepting establishes the invited address; the sign-in link that follows is what
 * actually gets the member into the console, on whatever device opens it.
 */
function AcceptInvite({ token }: { readonly token: string }) {
  const [stage, setStage] = useState<
    { readonly kind: "idle" } | { readonly kind: "accepting" } | { readonly kind: "sent" } | { readonly kind: "failed"; readonly message: string }
  >({ kind: "idle" });
  const headingRef = useHeadingFocus();

  async function accept(): Promise<void> {
    setStage({ kind: "accepting" });
    const result = await redeem(token);
    if (result.ok) {
      setStage({ kind: "sent" });
      return;
    }
    setStage({ kind: "failed", message: consoleApiMessage(result.error) });
  }

  return (
    <>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="optical-hang mt-6 text-5xl tracking-display outline-none">
        {m.invite.title}
      </h1>
      <div className="mt-8 blueprint">
        <Corners />
        {stage.kind === "accepting" ? <SweepBar /> : null}
        <PlateHeader meta={[m.form]} cells="tight" stack={false} />
        <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
          {stage.kind === "sent" ? (
            <div role="status" className="flex items-center gap-2.5 border border-line bg-surface-1 px-3.5 py-3">
              <Led lit />
              <span className="text-sm">{m.invite.sent}</span>
            </div>
          ) : (
            <>
              {stage.kind === "failed" ? (
                <p role="alert" className="text-label font-medium text-ink-alert">
                  {stage.message}
                </p>
              ) : null}
              <Button variant="primary" fullWidth className="max-sm:h-11" disabled={stage.kind === "accepting"} onClick={() => void accept()}>
                {m.invite.accept}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** An invite that is no longer live: the sheet's own line, drawn straight away -- no button, no request. */
function InviteClosed({ state }: { readonly state: "expired" | "withdrawn" }) {
  const headingRef = useHeadingFocus();
  return (
    <>
      <span className="inline-flex">
        <Mark size={40} />
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="optical-hang mt-6 text-5xl tracking-display outline-none">
        {m.invite.title}
      </h1>
      <div className="mt-8 blueprint">
        <Corners />
        <PlateHeader meta={[m.form]} cells="tight" stack={false} />
        <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
          <p role="alert" className="text-label font-medium text-ink-alert">
            {state === "expired" ? m.expired : m.withdrawn}
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * Dispatches a raw setup token to the state its `entry` (from `lookupInviteToken`, read server
 * side in page.tsx) says it is: unchanged first-Owner redemption, a live invite's one action, or
 * one of the sheet's two closed-invite refusals -- never a guess made in this component.
 */
export function RedeemToken({ token, entry }: { readonly token: string; readonly entry: InviteTokenLookup }) {
  if (entry.kind === "invite") {
    return entry.state === "live" ? <AcceptInvite token={token} /> : <InviteClosed state={entry.state} />;
  }
  return <RedeemOwnerLink token={token} />;
}
