/** The frame meter (spec §3.J; J5-10) is a review tool: allowed on preview deployments and in development, never in
 * production (nor in `test`, the unit/e2e runner's own NODE_ENV — neither is "development"). The server decides,
 * from `process.env` alone, so the page passes only this boolean to the client; it still shows the meter only with
 * ?journey-hud. Takes the same shape `process.env` has, so a caller can hand it over whole (see console/availability.ts
 * for the same pattern with a different pair of keys). */
export function hudAllowed(env: { readonly VERCEL_ENV?: string; readonly NODE_ENV?: string }): boolean {
  return env.VERCEL_ENV === "preview" || env.NODE_ENV === "development";
}
