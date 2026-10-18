// The email field's pieces, shared by the two forms that ask for an address: the sign-up capture and
// the expired-link form. The components differ in shape (consent line, button width) and stay apart;
// only the strings that must not drift live here.

import { messages } from "@/messages";
import type { SignupState } from "./use-signup";

// Neubrutal v4 (the traveller site): the label is Space Grotesk 700 14/20 caps in ink; the field is v4's .field (44px,
// 2px edge, paper, the control shadow, drawn by the well utility); a refusal is red.
export const LABEL = "font-structure text-sm font-bold uppercase leading-5 tracking-wide text-ink-1";
export const FIELD = "well h-11 min-h-11 w-full px-3 py-1.5 text-base placeholder:text-ink-3";
/** The refusal under the field. */
export const ALERT = "mt-0.5 text-sm leading-5 font-medium text-ink-alert";

/** Which answers put a message under the field and leave the form standing. Everything but a sent link. */
export const REFUSAL: Partial<Record<SignupState, string>> = {
  invalid: messages.subscribe.errors.invalid,
  limited: messages.subscribe.errors.limited,
  dailyLimit: messages.subscribe.errors.dailyLimit,
  error: messages.subscribe.errors.failed,
};
