// The email field's pieces, shared by the two forms that ask for an address: the sign-up capture and
// the expired-link form. The components differ in shape (consent line, button width) and stay apart;
// only the strings that must not drift live here.

import { messages } from "@/messages";
import type { SignupState } from "./use-signup";

export const LABEL = "font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text";
export const FIELD = "well h-11 min-h-9 w-full px-2.5 py-1.5 placeholder:text-ink-3";
/** The refusal under the field. */
export const ALERT = "mt-0.5 text-label leading-normal text-accent-soft-ink";

/** Which answers put a message under the field and leave the form standing. Everything but a sent link. */
export const REFUSAL: Partial<Record<SignupState, string>> = {
  invalid: messages.subscribe.errors.invalid,
  limited: messages.subscribe.errors.limited,
  dailyLimit: messages.subscribe.errors.dailyLimit,
  error: messages.subscribe.errors.failed,
};
