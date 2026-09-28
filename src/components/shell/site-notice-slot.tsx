import { cookies } from "next/headers";
import { connection } from "next/server";
import { SiteNoticeStrip } from "@/components/shell/site-notice";
import { NOTICE_COOKIE } from "@/components/shell/site-notice-cookie";
import { siteNotice } from "@/services/runtime-settings";

/**
 * The notice, if it is on and this device has not closed this version of it. Server only, and inside
 * a Suspense boundary in AppShell: the settings read (a five-second in-process copy, then one read
 * with an 800 ms timeout) never holds up the page it sits on. `siteNotice` never throws.
 *
 * Per request, always. Without `connection()` first, a build that read the notice as off returned
 * before touching the cookie, so /privacy, /tos, /pnr and the rest were prerendered with no notice
 * baked in, and never showed one. This makes every page in the shell render per request.
 */
export async function SiteNoticeSlot() {
  await connection();
  const notice = await siteNotice();
  if (!notice) return null;
  const closed = (await cookies()).get(NOTICE_COOKIE)?.value;
  if (closed === String(notice.version)) return null;
  return <SiteNoticeStrip text={notice.text} version={notice.version} />;
}
