"use client";

import { useState } from "react";
import { NOTICE_COOKIE } from "@/components/shell/site-notice-cookie";
import { messages } from "@/messages";

const m = messages.shell.siteNotice;

/** Long enough to outlast any notice; a new notice has a new version and shows regardless. */
const REMEMBER_SECONDS = 60 * 60 * 24 * 90;

/**
 * The site notice strip (Notices.dc.html, SITE NOTICE STRIP), transcribed: under the masthead on
 * every page, the steel wash, a lit lamp, the text and a 44px close button pulled to the frame's edge.
 * One line on desktop; it wraps on phones. It is not sticky, so it never covers the masthead.
 *
 * Closing it writes the notice's VERSION to a cookie, which the server reads before drawing
 * (site-notice-slot.tsx) — so a closed notice is never drawn and then removed on hydration, and a new
 * notice, with a new version, shows again.
 */
export function SiteNoticeStrip({ text, version }: { readonly text: string; readonly version: number }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  function close(): void {
    document.cookie = `${NOTICE_COOKIE}=${version}; max-age=${REMEMBER_SECONDS}; path=/; samesite=lax`;
    setClosed(true);
  }

  return (
    <div role="region" aria-label={m.label} className="border-b-2 border-edge bg-accent text-on-fill">
      <div className="page-frame flex items-center gap-4 py-2">
        <p className="m-0 max-w-none flex-1 text-sm leading-5">{text}</p>
        <button
          type="button"
          aria-label={m.close}
          onClick={close}
          className="nb-press tap-44 inline-flex min-h-8 shrink-0 cursor-pointer items-center justify-center rounded-control border-2 border-edge bg-paper px-2.5 text-ink-1 shadow-control hover:bg-pink hover:text-on-fill"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
