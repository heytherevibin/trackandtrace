import { messages } from "@/messages";

/**
 * What a list email says: the operator's body, then the unsubscribe line and the human page's link.
 *
 * The operator never types the link, so they cannot forget it. A list email without a working
 * unsubscribe is a legal problem that stays invisible until someone complains, so the sender
 * appends it rather than trusting the body to carry it.
 *
 * The line is the list's own: the availability list gets one email ever, and it must not tell its
 * reader they asked for news. `humanUrl` is the /unsubscribe page, which is a GET; the one-click POST endpoint belongs in the
 * headers (see `listHeaders`), not here.
 */
export function letterText(body: string, humanUrl: string, list: "news" | "availability"): string {
  return `${body.trimEnd()}\n\n${messages.subscribe.email.unsubscribeLine[list]}\n${humanUrl}\n`;
}

/**
 * The headers that make a mail client offer its own Unsubscribe button.
 *
 * The angle brackets are required by RFC 2369, and some clients ignore a header without them. The
 * Post header (RFC 8058) tells the client it may POST to the URL, which is why `oneClickUrl` must
 * be the POST endpoint and not the /unsubscribe page, which would answer 405.
 */
export function listHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
