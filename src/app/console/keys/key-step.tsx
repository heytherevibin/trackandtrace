"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { PlateHeader } from "@/components/ui/plate";
import { SweepBar } from "@/components/ui/sweep-bar";
import { consoleHref } from "@/console/href";
import { keysUsable, tapToSignIn } from "@/console/keys/client";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.keys;
const subscribeNever = () => () => undefined;
const keysUnusableOnServer = () => false;

type Stage = { readonly kind: "idle"; readonly error: string | null } | { readonly kind: "waiting" };

/** The key step (spec §C step 3): one tap, read against the two keys this member already holds. */
export function KeyStep() {
  const router = useRouter();
  // The server can never know what this browser can do; matching its "unusable" snapshot on the
  // first client render (rather than reading keysUsable() straight into useState) avoids a
  // hydration mismatch once the real answer differs. Same pattern as passkeys-plate.tsx.
  const usable = useSyncExternalStore(subscribeNever, keysUsable, keysUnusableOnServer);
  const [stage, setStage] = useState<Stage>({ kind: "idle", error: null });
  const buttonRef = useRef<HTMLButtonElement>(null);
  // What the previous render's stage was, so the button is refocused only on a genuine
  // "waiting" -> "idle" return (a dismissed or failed tap), never on first render.
  const previousStageKindRef = useRef<Stage["kind"]>(stage.kind);

  useEffect(() => {
    const previous = previousStageKindRef.current;
    previousStageKindRef.current = stage.kind;
    if (previous === "waiting" && stage.kind === "idle") buttonRef.current?.focus();
  }, [stage]);

  async function tap(): Promise<void> {
    setStage({ kind: "waiting" });
    const outcome = await tapToSignIn();
    if (outcome.kind === "done") {
      router.replace(consoleHref("/"));
      return;
    }
    setStage({ kind: "idle", error: outcome.kind === "failed" ? outcome.message : null });
  }

  const waiting = stage.kind === "waiting";
  const message = !usable ? m.unsupported : stage.kind === "idle" ? stage.error : null;

  return (
    <section className="blueprint" aria-labelledby="console-keys-plate">
      <Corners />
      {waiting ? <SweepBar /> : null}
      <PlateHeader title={m.title} titleId="console-keys-plate" cells="tight" meta={[m.form]} stack={false} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
        <p className="text-body text-ink-2">{m.status}</p>
        {message ? (
          <p role="alert" className="text-label font-medium text-ink-alert">
            {message}
          </p>
        ) : null}
        <Button ref={buttonRef} type="button" variant="primary" fullWidth className="max-sm:h-11" disabled={waiting || !usable} onClick={() => void tap()}>
          {waiting ? m.waiting : m.tap}
        </Button>
      </div>
    </section>
  );
}
