import { z } from "zod";
import { consoleMessages } from "@/console/messages";

/**
 * The reason, validated once, in a file with nothing behind it but zod and the copy -- so the
 * dialog can import it without dragging next/headers into the client bundle, which is what a
 * value-import from tap.ts would do.
 *
 * `.trim()` is a transform, so this schema decides the exact string that gets digested when a tap
 * is minted -- and the action that later spends that tap re-digests the same four fields inside
 * the database. Every route that carries a reason into a tap imports this. A second schema that
 * merely looks the same is how a reason with a trailing space mints one digest and spends against
 * another, and every such action then fails with "no tap for this action" and nothing says why.
 */
/**
 * Spec §E's upper bound, exported rather than left inline so the dialog's textarea can stop where
 * the schema stops. ConfirmItsYou renders `reasonShort` for *every* tapReason failure, so without a
 * `maxLength` a member who typed past 200 characters was told to write more -- the same trap both
 * key-name fields avoid by capping the input at KEY_NAME_MAX (`@/console/account/key-name`).
 */
export const TAP_REASON_MAX = 200;

export const tapReason = z.string().trim().min(10, consoleMessages.tap.reasonShort).max(TAP_REASON_MAX);
