import { accountsConfigured, activePnrSource, env, fixtureAllowed, isThirdPartySource, type Env } from "@/services/env";

// Service status as travellers see it, from the deployment's configuration. Phase 0 adds live
// health (the provider breaker) to "checks"; what is shown stays the same two parts.

export type ComponentState = "operational" | "unavailable";

export interface ServiceStatus {
  readonly overall: "operational" | "partial" | "down";
  readonly checks: ComponentState;
  readonly accounts: ComponentState;
}

export function serviceStatus(current: Env = env()): ServiceStatus {
  const checksUp = fixtureAllowed(current) || current.LIVE_SOURCE_ENABLED || isThirdPartySource(activePnrSource(current));
  const accountsUp = accountsConfigured(current);
  const checks: ComponentState = checksUp ? "operational" : "unavailable";
  const accounts: ComponentState = accountsUp ? "operational" : "unavailable";
  const overall = checksUp && accountsUp ? "operational" : checksUp || accountsUp ? "partial" : "down";
  return { overall, checks, accounts };
}
