import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import { accountsConfigured, flags } from "@/services/env";
import { FooterSwitch } from "./footer-switch";
import { IstClock } from "./ist-clock";
import { PRIMARY_NAV } from "./nav-config";

const COLUMN_LINK = "text-sm text-ink-2 no-underline hover:text-ink-1";

/** The landing's enterprise footer: brand and disclaimer, link columns, live status lamps, then the clock bar. */
function FullFooter() {
  const m = messages.shell.footer;
  const rows = [
    { label: m.sourceRow, on: flags.liveSource },
    { label: m.accountsRow, on: accountsConfigured() },
  ];
  const year = new Date().getFullYear();
  return (
    <>
      <div className="page-frame flex flex-wrap gap-x-18 gap-y-10 py-12">
        <div className="max-w-measure flex-[1.4_1_15rem]">
          <Wordmark descriptor />
          <p className="mt-4 text-sm text-ink-2">{messages.common.footerDisclaimer}</p>
        </div>
        <div className="flex-[1_1_8rem]">
          <p className="kicker">{m.product}</p>
          <ul className="mt-3.5 flex flex-col gap-2.5">
            {PRIMARY_NAV.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={COLUMN_LINK}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-[1_1_8rem]">
          <p className="kicker">{m.company}</p>
          <ul className="mt-3.5 flex flex-col gap-2.5">
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
        <div className="flex-[1.2_1_14rem]">
          <p className="kicker">{m.status}</p>
          <ul className="mt-3.5 flex flex-col gap-2.5" aria-label={m.statusLabel}>
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2.5">
                <Led lit={row.on} tone="go" />
                <span className="text-sm text-ink-2">{row.label}</span>
                <span className="legend-sm ml-auto">{row.on ? m.connected : m.notConnected}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="seam">
        <div className="page-frame flex flex-wrap items-center justify-between gap-2 py-4">
          <p className="legend-md">{m.copyright(year)}</p>
          <IstClock />
        </div>
      </div>
    </>
  );
}

/** App pages carry one line: the disclaimer and the clock. */
function CompactFooter() {
  const year = new Date().getFullYear();
  return (
    <div className="page-frame flex flex-wrap items-center justify-between gap-2 py-4">
      <p className="text-label text-ink-3">{`${messages.common.notAffiliated} · ${messages.shell.footer.copyright(year)}`}</p>
      <IstClock />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line pb-(--tabbar-height) md:pb-0">
      <FooterSwitch full={<FullFooter />} compact={<CompactFooter />} />
    </footer>
  );
}
