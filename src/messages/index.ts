import { account } from "./en-IN/account";
import { accuracy } from "./en-IN/accuracy";
import { auth } from "./en-IN/auth";
import { booking } from "./en-IN/booking";
import { check } from "./en-IN/check";
import { legal } from "./en-IN/legal";
import { home } from "./en-IN/home";
import { result } from "./en-IN/result";
import { source } from "./en-IN/source";
import { common } from "./en-IN/common";
import { shell } from "./en-IN/shell";
import { states } from "./en-IN/states";
import { status } from "./en-IN/status";
import { watchlist } from "./en-IN/watchlist";

// Every UI string lives here. Components read typed keys; no literals in JSX.
// Adding a locale means adding an en-IN-shaped tree, not touching components.

export const locale = "en-IN" as const;

export const messages = { common, status, check, states, shell, home, source, result, watchlist, auth, account, booking, accuracy, legal } as const;

export type Messages = typeof messages;
