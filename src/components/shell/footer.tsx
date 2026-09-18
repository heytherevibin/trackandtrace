import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { messages } from "@/messages";
import { ServicePill } from "@/components/status/service-pill";
import { serviceStatus } from "@/services/service-status";
import { FooterSections } from "./footer-sections";
import { COLUMN_HEAD, COLUMN_LINK, COLUMN_LIST } from "./footer-styles";
import { FooterSwitch } from "./footer-switch";
import { IstClock } from "./ist-clock";
import { PRIMARY_NAV } from "./nav-config";

/** The landing's footer: brand and disclaimer, Sections, Product, Company; then one bar with the copyright, service status and clock. */
function FullFooter() {
  const m = messages.shell.footer;
  const status = serviceStatus();
  const year = new Date().getFullYear();
  return (
    <>
      <div className="page-frame flex flex-wrap gap-x-[clamp(32px,4vw,72px)] gap-y-10 py-12">
        <div className="max-w-[30rem] flex-[1.4_1_240px]">
          <span className="inline-flex items-center gap-2.5">
            <Mark size={24} />
            <span className="flex flex-col leading-stack">
              <span className="font-display text-lead font-semibold uppercase tracking-brand">{messages.common.productName}</span>
              <span className="font-display text-2xs font-semibold uppercase tracking-caps text-ink-1/70">{messages.common.descriptor}</span>
            </span>
          </span>
          <p className="mt-4 text-sm text-ink-1/74">{messages.common.footerDisclaimer}</p>
        </div>
        <div className="flex-[1_1_130px]">
          <p className={COLUMN_HEAD}>{m.sections}</p>
          <FooterSections />
        </div>
        <div className="flex-[1_1_130px]">
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
        <div className="flex-[1_1_130px]">
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
      <div className="border-t border-line">
        <div className="page-frame flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
          <p className="m-0 font-display text-xs font-semibold uppercase tracking-caps text-ink-1/70">{m.copyright(year)}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ServicePill status={status} />
            <IstClock />
          </div>
        </div>
      </div>
    </>
  );
}

/** App pages carry one line, as drawn: the disclaimer and © at 13px, the clock on the right. */
function CompactFooter() {
  const year = new Date().getFullYear();
  return (
    <div className="page-frame flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
      <p className="m-0 text-label leading-normal text-ink-1/70">
        {messages.common.notAffiliated}
        {"  ·  "}
        {messages.shell.footer.copyright(year)}
      </p>
      <IstClock />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <FooterSwitch full={<FullFooter />} compact={<CompactFooter />} />
    </footer>
  );
}
