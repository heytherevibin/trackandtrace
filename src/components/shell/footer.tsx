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

/**
 * The footer of every traveller page, as Neubrutal v4 draws it: ruled off with the 2px edge; the edged mark, TRAKLINE and
 * the disclaimer, then Sections, Product and Company (two columns on a phone, the brand above them); then one bar with
 * the copyright and the status lamp with the IST clock. The bar keeps the Motion switch (the owner, 2026-10-18). The
 * sign-up is the band above (updates-band.tsx).
 */
export function Footer() {
  const m = messages.shell.footer;
  const status = serviceStatus();
  const year = new Date().getFullYear();
  return (
    // On a phone the tab bar is fixed over the foot of the window, so the footer leaves 84px under its last line (v4) and
    // still ends the page.
    <footer className="border-t-2 border-edge max-sm:pb-[calc(3.75rem+24px+var(--safe-bottom))]">
      {/* The brand, then the three link columns as one group (the owner, 2026-10-01: Company never wraps alone between 640
          and 768px, where v4's own grid would leave it). On a phone, v4's two columns under the brand. */}
      <div className="page-frame flex flex-wrap gap-8 py-12 max-sm:gap-y-6 max-sm:pb-6 max-sm:pt-8">
        <div data-footer-column="" className="max-w-[36ch] flex-[1.4_1_240px] max-sm:basis-full">
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex overflow-hidden rounded-plate border-2 border-edge">
              <Mark size={20} className="block" />
            </span>
            <span className="font-display text-base uppercase leading-6">{messages.common.productName}</span>
          </span>
          <p className="m-0 mt-3 text-sm leading-5 text-ink-2">{messages.common.footerDisclaimer}</p>
        </div>
        <div className="grid min-w-0 flex-[3_1_calc(390px+4rem)] grid-cols-3 gap-8 max-sm:basis-full max-sm:grid-cols-2 max-sm:gap-x-4 max-sm:gap-y-6">
        <div data-footer-column="" className="min-w-0">
          <p className={COLUMN_HEAD}>{m.sections}</p>
          <FooterSections />
        </div>
        <div data-footer-column="" className="min-w-0">
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
        <div data-footer-column="" className="min-w-0">
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
      <div className="border-t-2 border-edge">
        <div className="legend page-frame flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <span>{m.copyright(year)}</span>
          <span className="inline-flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="inline-flex flex-wrap items-center gap-2">
              <ServicePill status={status} />
              <span aria-hidden="true">·</span>
              <IstClock />
            </span>
            <MotionToggle />
          </span>
        </div>
      </div>
    </footer>
  );
}
