import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { messages } from "@/messages";
import { ServicePill } from "@/components/status/service-pill";
import { serviceStatus } from "@/services/service-status";
import { FooterSections } from "./footer-sections";
import { COLUMN_HEAD, COLUMN_LINK, COLUMN_LIST } from "./footer-styles";
import { IstClock } from "./ist-clock";
import { MotionToggle } from "./motion-toggle";
import { PRIMARY_NAV } from "./nav-config";
import { SoundToggle } from "./sound-toggle";

/**
 * The footer of every traveller page (the owner, 2026-10-01): brand and disclaimer, Sections, Product and Company;
 * then one bar with the copyright, service status, the clock, and the Motion and Sound switches. The sign-up is not
 * here: it is the band above (updates-band.tsx). Sound shows only while the landing's journey runs
 * (html[data-journey="on"] .sound-toggle, journey-island.css), since only the journey can sound.
 */
export function Footer() {
  const m = messages.shell.footer;
  const status = serviceStatus();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line">
      <div className="page-frame flex flex-wrap gap-x-[clamp(32px,4vw,72px)] gap-y-10 py-12">
        <div data-footer-column="" className="max-w-[30rem] flex-[1.4_1_240px]">
          <span className="inline-flex items-center gap-2.5">
            <Mark size={24} />
            <span className="flex flex-col leading-stack">
              <span className="font-display text-lead font-semibold uppercase tracking-brand">{messages.common.productName}</span>
              <span className="font-display text-2xs font-semibold uppercase tracking-caps text-ink-1/70">{messages.common.descriptor}</span>
            </span>
          </span>
          <p className="mt-4 text-sm text-ink-1/74">{messages.common.footerDisclaimer}</p>
        </div>
        {/* The three link columns. From sm they are one flex item, three equal columns on one row, so when the row is
            too narrow for all four the brand takes a row and the three stay together (at 768px Company used to wrap
            alone). Its basis and growth are the three columns' own (3 × 130px and the two gaps between them), so a row
            that holds all four is drawn exactly as before. Below sm it steps aside (contents) and the phone's wrap is
            unchanged. */}
        <div className="max-sm:contents sm:grid sm:flex-[3_1_calc(390px+2*clamp(32px,4vw,72px))] sm:grid-cols-3 sm:gap-x-[clamp(32px,4vw,72px)]">
          <div data-footer-column="" className="min-w-0 flex-[1_1_130px]">
            <p className={COLUMN_HEAD}>{m.sections}</p>
            <FooterSections />
          </div>
          <div data-footer-column="" className="min-w-0 flex-[1_1_130px]">
            <p className={COLUMN_HEAD}>{m.product}</p>
            <ul className={COLUMN_LIST}>
              {PRIMARY_NAV.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href === "/" ? "/#terminal" : href} className={COLUMN_LINK}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div data-footer-column="" className="min-w-0 flex-[1_1_130px]">
            <p className={COLUMN_HEAD}>{m.company}</p>
            <ul className={COLUMN_LIST}>
              <li>
                <Link href="/privacy" className={COLUMN_LINK}>
                  {m.privacy}
                </Link>
              </li>
              <li>
                <Link href="/tos" className={COLUMN_LINK}>
                  {m.terms}
                </Link>
              </li>
              <li>
                <Link href="/account" className={COLUMN_LINK}>
                  {messages.shell.nav.account}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="page-frame flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <p className="m-0 font-display text-xs font-semibold uppercase tracking-caps text-ink-1/70">{m.copyright(year)}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ServicePill status={status} />
            <IstClock />
            <MotionToggle />
            <SoundToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
