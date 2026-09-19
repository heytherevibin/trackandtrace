import SiteLayout from "./(site)/layout";
import SiteNotFound from "./(site)/not-found";

export { metadata, viewport } from "./(site)/layout";

/**
 * Unmatched addresses on the traveller host, served on the server with status 404.
 * The console host never reaches this: the proxy rewrites console paths into
 * src/app/console, whose catch-all sends them to sign in.
 */
export default function GlobalNotFound() {
  return (
    <SiteLayout>
      <SiteNotFound />
    </SiteLayout>
  );
}
