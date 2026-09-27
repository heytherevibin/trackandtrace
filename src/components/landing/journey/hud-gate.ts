import type { Env } from "@/services/env";

/** The frame meter (spec §3.J; J5-10) is a review tool: allowed on preview deployments and in development, never in
 * production (nor in `test`, the unit/e2e runner's own NODE_ENV — neither is "development"). The server decides, from
 * the environment services/env.ts parsed (application code never reads process.env directly), so the page passes only
 * this boolean to the client; it still shows the meter only with ?journey-hud. */
export function hudAllowed(env: Pick<Env, "VERCEL_ENV" | "NODE_ENV">): boolean {
  return env.VERCEL_ENV === "preview" || env.NODE_ENV === "development";
}
