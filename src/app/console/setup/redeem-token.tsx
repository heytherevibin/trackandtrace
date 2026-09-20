"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Mark } from "@/components/brand/mark";
import { Corners } from "@/components/ui/corners";
import { PlateHeader } from "@/components/ui/plate";
import { SweepBar } from "@/components/ui/sweep-bar";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";

const m = consoleMessages.setup;
const s = consoleMessages.session;
const REDEEMED = z.object({ ok: z.literal(true) });

type Stage = { readonly kind: "working" } | { readonly kind: "failed"; readonly message: string };

// /api/setup runs the link lookup, createUser, generateLink, verifyOtp, the redeem RPC and
// startConsoleSession in sequence -- six-odd round trips to Supabase, not the one or two apiRequest's
// 8-second default assumes. A timeout here does not just fail the request: it can land after the
// link was already spent, so the member sees a failure with no way to tell whether it also worked.
const REDEEM_TIMEOUT_MS = 20_000;

/**
 * The one-time link out of the Supabase SQL editor (spec: no invite, no email -- opening it is the
 * whole credential). Redeems it once against /api/setup, then hands off to the plain /setup route,
 * which finds the new link session and renders SetupFlow from there.
 */
export function RedeemToken({ token }: { readonly token: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "working" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Strict Mode double-invokes effects in development; this token is single-use, so a second
  // attempt in the same mount must never fire a second request.
  const attempted = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void (async () => {
      const result = await apiRequest(
        "/api/setup",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) },
        REDEEMED,
        { timeoutMs: REDEEM_TIMEOUT_MS },
      );
      if (result.ok) {
        router.replace(consoleHref("/setup"));
        return;
      }
      const { code } = result.error;
      setStage({ kind: "failed", message: code === "SOURCE_UNAVAILABLE" || code === "INTERNAL" ? s.unavailable : result.error.message });
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
