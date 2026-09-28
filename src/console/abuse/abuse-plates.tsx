import Link from "next/link";
import { Plate } from "@/components/ui/plate";
import { memberOf, shortHash } from "@/console/abuse/abuse";
import { BlockDialog } from "@/console/abuse/block-dialog";
import { UnblockButton } from "@/console/abuse/unblock-button";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import type { StoreState } from "@/console/overview/overview";
import type { Block } from "@/services/blocklist";
import type { LimitedToday } from "@/services/limited-log";
import { formatCount, formatDateTime, formatTime } from "@/utils/datetime";

// Module 04's three plates. Server components; the row actions (Block, Unblock) are the client
// islands. At 390 wide the tables are read-only, as the brief draws them — "Block an address" is the
// urgent action, and it stays in the page header at every width.
//
// **An unread count is never a zero.** "Limited today: 0" is a claim about a quiet day; a log that
// could not be read says so instead.

const m = consoleMessages.abuse;

function Status({ children }: { readonly children: string }) {
  return (
    <p role="status" className="border-line border-t px-5 py-3 text-sm">
      {children}
    </p>
  );
}

export function LimitsPlate({
  perMinute,
  live,
  limitedToday,
  store,
}: {
  readonly perMinute: number;
  /** Null when the deployment asks no third-party source, so there is no budget. */
  readonly live: { readonly used: number | null; readonly limit: number } | null;
  readonly limitedToday: number | null;
  readonly store: StoreState;
}) {
  return (
    <Plate as="section" title={m.limits.title} titleId="ab-limits" headingLevel={2} padding="none">
      <ul className="flex flex-col gap-2 px-5 py-4 text-sm">
        <li>{m.limits.rule(perMinute)}</li>
        <li>{live === null ? m.limits.noBudget : live.used === null ? m.limits.liveUnknown : m.limits.live(formatCount(live.used), formatCount(live.limit))}</li>
        <li>{limitedToday === null ? m.limits.limitedUnknown : m.limits.limited(formatCount(limitedToday))}</li>
      </ul>
      <div className="border-line border-t px-5 py-3">
        <Link href={consoleHref("/settings")} className="text-accent-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">
          {m.limits.change}
          <span aria-hidden>&nbsp;→</span>
        </Link>
      </div>
      {store === "unreachable" ? <Status>{m.storeUnavailable}</Status> : null}
      {store === "local" ? <p className="text-ink-1/70 border-line border-t px-5 py-3 text-xs">{m.localOnly}</p> : null}
    </Plate>
  );
}

/** Row actions are hidden below sm: the brief draws the tables read-only on a phone. */
const ACTION_CELL = "px-5 py-1.5 text-right max-sm:hidden";

/** `null` is a log that could not be read. */
export function MostLimitedPlate({ today, environment }: { readonly today: LimitedToday | null; readonly environment: string }) {
  return (
    <Plate as="section" title={m.mostLimited.title} titleId="ab-most" headingLevel={2} padding="none">
      {today === null ? (
        <p role="status" className="px-5 py-4 text-sm">
          {m.mostLimited.unavailable}
        </p>
      ) : today.top.length === 0 ? (
        <p className="px-5 py-4 text-sm">{m.mostLimited.quiet}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{m.mostLimited.caption}</caption>
            <thead>
              <tr className="border-line border-b">
                {[m.mostLimited.address, m.mostLimited.times, m.mostLimited.first, m.mostLimited.last].map((h) => (
                  <th key={h} scope="col" className="legend whitespace-nowrap px-5 py-2 font-normal">
                    {h}
                  </th>
                ))}
                <td className={ACTION_CELL} />
              </tr>
            </thead>
            <tbody>
              {today.top.map((row) => (
                <tr key={`${row.network}.${row.hash}`} className="border-line border-t first:border-t-0">
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <span className="font-data">{shortHash(row.hash)}</span>
                    {row.network === "ipv6" ? <span className="legend-sm border-line ml-2 border px-1.5 py-0.5">{m.mostLimited.ipv6}</span> : null}
                  </td>
                  <td className="font-data tnum px-5 py-2.5">{formatCount(row.times)}</td>
                  <td className="font-data tnum whitespace-nowrap px-5 py-2.5">{m.mostLimited.at(formatTime(new Date(row.firstSeen)))}</td>
                  <td className="font-data tnum whitespace-nowrap px-5 py-2.5">{m.mostLimited.at(formatTime(new Date(row.lastSeen)))}</td>
                  <td className={ACTION_CELL}>
                    <BlockDialog environment={environment} member={memberOf(row.hash, row.network)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Plate>
  );
}

/**
 * `null` is a blocklist that could not be read. `keyId` is the current address key's: a block made
 * under another no longer matches its address — the same address now hashes differently — which the
 * brief calls a stale block and asks to be said.
 */
export function BlockedPlate({ blocks, environment, keyId }: { readonly blocks: readonly Block[] | null; readonly environment: string; readonly keyId: string }) {
  const stale = blocks === null ? 0 : blocks.filter((b) => b.keyId !== keyId).length;
  return (
    <Plate as="section" title={m.blocked.title} titleId="ab-blocked" headingLevel={2} padding="none">
      {blocks === null ? (
        <p role="status" className="px-5 py-4 text-sm">
          {m.blocked.unavailable}
        </p>
      ) : blocks.length === 0 ? (
        <p className="px-5 py-4 text-sm">{m.blocked.none}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{m.blocked.caption}</caption>
            <thead>
              <tr className="border-line border-b">
                {[m.blocked.address, m.blocked.note, m.blocked.by, m.blocked.since, m.blocked.until, m.blocked.refused].map((h) => (
                  <th key={h} scope="col" className="legend whitespace-nowrap px-5 py-2 font-normal">
                    {h}
                  </th>
                ))}
                <td className={ACTION_CELL} />
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.member} className="border-line border-t first:border-t-0">
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <span className="font-data">{shortHash(b.hash)}</span>
                    {b.network === "ipv6" ? <span className="legend-sm border-line ml-2 border px-1.5 py-0.5">{m.mostLimited.ipv6}</span> : null}
                  </td>
                  <td className="px-5 py-2.5">{b.note}</td>
                  <td className="whitespace-nowrap px-5 py-2.5">{b.by}</td>
                  <td className="font-data tnum whitespace-nowrap px-5 py-2.5">{m.blocked.at(formatDateTime(new Date(b.since)))}</td>
                  <td className="font-data tnum whitespace-nowrap px-5 py-2.5">{b.until === null ? m.blocked.untilRemoved : m.blocked.at(formatDateTime(new Date(b.until)))}</td>
                  <td className="font-data tnum px-5 py-2.5">{formatCount(b.refused)}</td>
                  <td className={ACTION_CELL}>
                    <UnblockButton environment={environment} member={b.member} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stale > 0 ? <p className="text-ink-1/70 border-line border-t px-5 py-3 text-xs">{m.blocked.stale(stale)}</p> : null}
    </Plate>
  );
}
