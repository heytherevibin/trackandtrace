import { consoleMessages } from "@/console/messages";
import type { ApiErrorBody } from "@/services/errors";

/**
 * The line to show a member when a console request fails.
 *
 * `SOURCE_UNAVAILABLE` and `INTERNAL` carry whatever the failing layer had to say -- a provider's
 * wording, a driver's message, a stack-shaped string -- so they are answered with the console's own
 * sentence instead. Every other code is ours and already written for a member to read, so it passes
 * through.
 *
 * This lives in one file because it was four byte-identical copies in four modules, and the rule it
 * encodes is not a formatting preference: one copy drifting is one surface that starts showing a
 * member text nobody wrote for them.
 */
export function consoleApiMessage(error: ApiErrorBody): string {
  return error.code === "SOURCE_UNAVAILABLE" || error.code === "INTERNAL" ? consoleMessages.session.unavailable : error.message;
}
