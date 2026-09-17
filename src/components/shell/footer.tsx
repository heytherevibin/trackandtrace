import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { IstClock } from "./ist-clock";
import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import { accountsConfigured, flags } from "@/services/env";
import { PRIMARY_NAV } from "./nav-config";

/** The rear panel: legends, links, and the live connection lamps. Server-rendered. */
export function Footer() {
  const m = messages.shell.footer;
  const rows = [
    { label: m.sourceRow, on: flags.liveSource },
    { label: m.accountsRow, on: accountsConfigured() },
  ];
  return (
    <footer className="seam mt-24 bg-surface-1">
      <div className="mx-auto grid w-full max-w-page gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="max-w-narrow">
          <Wordmark />
          <p className="mt-4 text-sm text-ink-2">{messages.common.notAffiliated}</p>
        </div>
        <div>
          <p className="silk">{m.product}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {PRIMARY_NAV.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="text-ink-2 hover:text-ink-1">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="silk">{m.company}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/privacy" className="text-ink-2 hover:text-ink-1">
                {m.privacy}
              </Link>
            </li>
            <li>
              <Link href="/tos" className="text-ink-2 hover:text-ink-1">
                {m.terms}
              </Link>
            </li>
            <li>
              <Link href="/account" className="text-ink-2 hover:text-ink-1">
                {messages.shell.nav.account}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="silk">{m.status}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2">
                <Led tone={row.on ? "go" : "watch"} lit />
                <span className="text-ink-2">{row.label}</span>
                <span className="silk ml-auto">{row.on ? m.connected : m.notConnected}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="seam">
        <div className="mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="silk">{m.copyright(new Date().getFullYear())}</p>
          <IstClock />
        </div>
      </div>
    </footer>
  );
}
