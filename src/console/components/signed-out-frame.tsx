import { headers } from "next/headers";
import type { ReactNode } from "react";
import { env } from "@/services/env";
import { ConsoleMasthead } from "./console-masthead";
import { EnvStrip } from "./env-strip";

/** Sign In and Setup: the environment strip, the masthead, and one 440px column (full width on phones). */
export async function SignedOutFrame({ children }: { readonly children: ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  return (
    <div className="flex min-h-dvh flex-col">
      <EnvStrip production={env().VERCEL_ENV === "production"} host={host} />
      <ConsoleMasthead />
      <main id="main" className="flex flex-1 justify-center px-4 py-8 sm:px-6 sm:py-18">
        <div className="flex w-full flex-col sm:w-[440px]">{children}</div>
      </main>
    </div>
  );
}
