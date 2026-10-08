import { accountActRoute } from "@/console/accounts/act-route";

export const dynamic = "force-dynamic";

/** POST /api/accounts/enable — Enable: the account can sign in again. Behind a reason and a key (act-route.ts). */
export const POST = accountActRoute("enable");
