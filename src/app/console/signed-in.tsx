"use client";

// This is the placeholder plan 2d replaces with the drawn frame (docs/design/sheets/console/Main.dc.html)
// and Overview. It exists only to prove the sign-in journey ends somewhere a member can see: who is
// signed in, and the way out. Nothing here is meant to survive that PR.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { apiRequest } from "@/services/api-client";
import type { ApiErrorBody } from "@/services/errors";

const f = consoleMessages.frame;
const s = consoleMessages.session;

const okSchema = z.object({ ok: z.literal(true) });

// Same rule as src/console/keys/client.ts: SOURCE_UNAVAILABLE/INTERNAL are apiRequest's own
// technical wording, not sheet copy, so they're replaced; every other refusal already reads right.
function messageFor(error: ApiErrorBody): string {
  return error.code === "SOURCE_UNAVAILABLE" || error.code === "INTERNAL" ? s.unavailable : error.message;
}

export interface SignedInProps {
  readonly name: string;
  readonly role: ConsoleRole;
}

interface State {
  readonly pending: boolean;
  readonly error: string | null;
}

/** Who is signed in, and the way out -- the whole of this placeholder seat. */
export function SignedIn({ name, role }: SignedInProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ pending: false, error: null });

  async function signOut(): Promise<void> {
    setState({ pending: true, error: null });
    const outcome = await apiRequest("/api/sign-out", { method: "POST" }, okSchema);
    if (!outcome.ok) {
      setState({ pending: false, error: messageFor(outcome.error) });
      return;
    }
    router.replace(consoleHref("/login"));
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="text-body font-medium text-ink-1">{name}</span>
        <Badge variant="steel" caps>
          {f.roleLabel[role]}
        </Badge>
      </div>
      {state.error ? (
        <p role="alert" className="text-label font-medium text-ink-alert">
          {state.error}
        </p>
      ) : null}
      <Button type="button" variant="secondary" disabled={state.pending} onClick={() => void signOut()}>
        {f.signOut}
      </Button>
    </div>
  );
}
