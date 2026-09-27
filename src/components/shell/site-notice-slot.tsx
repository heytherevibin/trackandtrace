import { cookies } from "next/headers";
import { NOTICE_COOKIE, SiteNoticeStrip } from "@/components/shell/site-notice";
import { siteNotice } from "@/services/runtime-settings";

/**
 * The notice, if it is on and this device has not closed this version of it. Server only, and inside
 * a Suspense boundary in AppShell: the settings read (a five-second in-process copy, then one read
 * with an 800 ms timeout) never holds up the page it sits on. `siteNotice` never throws.
 */
export async function SiteNoticeSlot() {
  const notice = await siteNotice();
  if (!notice) return null;
  const closed = (await cookies()).get(NOTICE_COOKIE)?.value;
  if (closed === String(notice.version)) return null;
  return <SiteNoticeStrip text={notice.text} version={notice.version} />;
}
