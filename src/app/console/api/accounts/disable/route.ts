import { accountActRoute } from "@/console/accounts/act-route";

export const dynamic = "force-dynamic";

/** POST /api/accounts/disable — Disable: signs the account out and has every sign-in refused until Enable. Behind a reason and a key (act-route.ts). */
export const POST = accountActRoute("disable");
