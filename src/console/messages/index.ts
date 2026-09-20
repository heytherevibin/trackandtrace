import { availability } from "./en-IN/availability";
import { frame } from "./en-IN/frame";
import { session } from "./en-IN/session";
import { signIn } from "./en-IN/sign-in";

/** Console copy. It may name providers; traveller code never imports it (tests/unit/console/boundary.contract.test.ts). */
export const consoleMessages = { frame, signIn, availability, session } as const;
