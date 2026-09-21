import { availability } from "./en-IN/availability";
import { email } from "./en-IN/email";
import { frame } from "./en-IN/frame";
import { frameSignedIn } from "./en-IN/frame-signed-in";
import { keys } from "./en-IN/keys";
import { myKeys } from "./en-IN/my-keys";
import { session } from "./en-IN/session";
import { setup } from "./en-IN/setup";
import { signIn } from "./en-IN/sign-in";
import { tap } from "./en-IN/tap";

/** Console copy. It may name providers; traveller code never imports it (tests/unit/console/boundary.contract.test.ts). */
export const consoleMessages = { frame, frameSignedIn, signIn, availability, session, email, keys, myKeys, setup, tap } as const;
