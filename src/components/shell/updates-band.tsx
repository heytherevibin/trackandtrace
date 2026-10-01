"use client";

import { usePathname } from "next/navigation";
import { BODY, H2 } from "@/components/landing/sheet-type";
import { SignupCapture } from "@/components/subscribe/signup-capture";
import { messages } from "@/messages";
import { UPDATES_BAND_ID, bandVariant } from "./band-rule";

const TITLE_ID = `${UPDATES_BAND_ID}-title`;

/**
 * "Updates by email": the sign-up as its own quiet band between the page and the footer (the owner, 2026-10-01).
 * A split row under a hairline at the sheet's width: the heading and the promise on the left, the field and button
 * on the right with the consent line under them; one column on a phone. Full on the landing, slim on the app pages,
 * absent where band-rule.ts says so. Transparent, so the page's grain shows through. On the landing its two halves
 * rise once with the other sections (journey/arrivals.ts, [data-rise]); it is not a station.
 */
export function UpdatesBand() {
  const variant = bandVariant(usePathname());
  if (!variant) return null;
  const full = variant === "full";
  const m = messages.subscribe;
  return (
    <section id={UPDATES_BAND_ID} aria-labelledby={TITLE_ID} data-variant={variant}>
      <div className="page-frame">
        <hr className="m-0 h-px border-0 bg-line" />
        <div className={`grid grid-cols-1 gap-x-[clamp(32px,6vw,96px)] gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(0,min(30rem,50%))] md:items-start ${full ? "pb-[60px] pt-12" : "py-[28px]"}`}>
          <div data-rise="" className="min-w-0">
            <h2 id={TITLE_ID} className={full ? `m-0 ${H2}` : "m-0 text-2xl leading-6 tracking-head wrap-anywhere"}>
              {m.places.footerColumn}
            </h2>
            <p className={full ? `m-0 mt-3.5 max-w-[44ch] ${BODY}` : "m-0 mt-1.5 text-sm text-ink-1/78"}>{m.promise.news}</p>
          </div>
          <div data-rise="" className="min-w-0">
            <SignupCapture place="band" list="news" source={full ? "landing" : "footer"} />
          </div>
        </div>
      </div>
    </section>
  );
}
