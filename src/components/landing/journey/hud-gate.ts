/** The frame meter (spec §3.J; J5-10) is a review tool: allowed on preview deployments and in development, never in
 * production. The server decides; the page still shows it only with ?journey-hud. */
export function hudAllowed(vercelEnv: string | undefined, nodeEnv: string | undefined): boolean {
  return vercelEnv === "preview" || nodeEnv === "development";
}
