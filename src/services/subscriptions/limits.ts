/**
 * How often one connection may sign up (spec §3, step 2).
 *
 * Five an hour per address, IPv6 counted per /64 like every other traveller limit — `addressKey`
 * does that, so nothing here has to. Five is generous for a person signing up for two lists and
 * mistyping once, and small enough that a script cannot walk a list of addresses through the daily
 * email allowance.
 *
 * Its scope is in `LIMITED_SCOPES`, so a refusal is counted in module 04 beside a refused PNR check
 * rather than being forgotten by the limiter.
 */
export const SUBSCRIBE_RATE_LIMIT = { limit: 5, windowMs: 3_600_000 } as const;
