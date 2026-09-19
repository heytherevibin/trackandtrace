import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { consoleHref } from "@/console/href";
import { isConsoleHost } from "@/console/hosts";
import { env } from "@/services/env";
import SiteLayout from "./(site)/layout";
import SiteNotFound from "./(site)/not-found";

export { metadata, viewport } from "./(site)/layout";

/**
 * Unmatched addresses. On the traveller host, the site's own not-found page, rendered on
 * the server with status 404. On the console host, only paths the proxy lets through (its
 * asset prefixes) can land here, and they go to sign in like the console's own catch-all,
 * so the admin host never renders traveller pages.
 */
export default async function GlobalNotFound() {
  const requested = await headers();
  if (isConsoleHost(requested.get("host"), env().VERCEL_ENV)) redirect(consoleHref("/login"));
  return (
    <SiteLayout>
      <SiteNotFound />
    </SiteLayout>
  );
}
