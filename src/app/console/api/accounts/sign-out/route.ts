import { accountActRoute } from "@/console/accounts/act-route";

export const dynamic = "force-dynamic";

/** POST /api/accounts/sign-out — Sign out everywhere: ends every session the account has, now. Behind a reason and a key (act-route.ts). */
export const POST = accountActRoute("signOut");
