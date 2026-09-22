"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DismissRegular } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { IconButton } from "@/components/ui/icon-button";
import { KeyValueList, type KeyValueItem } from "@/components/ui/key-value-list";
import { PlateHeader } from "@/components/ui/plate";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBlock } from "@/components/ui/state-block";
import { consoleApiMessage } from "@/console/api-message";
import type { AuditEntryDetail } from "@/console/audit/audit";
import { AUDIT_RESULTS } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";
import { messages } from "@/messages";
import { apiRequest } from "@/services/api-client";
import { log } from "@/services/log";
import { formatDateTimeSeconds } from "@/utils/datetime";

const m = consoleMessages.audit;
const f = consoleMessages.frame;
const ist = consoleMessages.frameSignedIn.clock.ist;

// The response shape of GET /api/audit?id=, restated here rather than imported, for the reason
// entries-plate.tsx gives at length: `audit.ts` reaches the database through `@/console/auth/db`,
// which reads next/headers, so it cannot be pulled into a browser bundle. `entry` is null for an id
// that is not there -- that is the database's own answer and not an error (task-3-addendum.md §3),
// so it is part of the success shape.
const responseShape = z.object({
  ok: z.literal(true),
  entry: z
    .object({
      id: z.guid(),
      at: z.iso.datetime({ offset: true }),
      environment: z.string().min(1),
      actorId: z.guid().nullable(),
      actorName: z.string().min(1),
      actorRole: z.enum(["owner", "admin", "support", "viewer"]).nullable(),
      keyId: z.guid().nullable(),
      keyName: z.string().min(1).nullable(),
      sessionLabel: z.string().nullable(),
      category: z.string().min(1),
      action: z.string().min(1),
      target: z.string().nullable(),
      reason: z.string().nullable(),
      result: z.enum(AUDIT_RESULTS),
      addressHash: z.string().nullable(),
      before: z.json(),
      after: z.json(),
    })
    .nullable(),
});

type State = { readonly kind: "loading" } | { readonly kind: "ready"; readonly entry: AuditEntryDetail } | { readonly kind: "missing" } | { readonly kind: "error" };

function isFields(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function absent(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * One side of one field, as the sheet writes it (:238): a string in the module's own curly quotes,
 * the same quotes the table already puts a reason in, and `none` where a field is missing from that
 * snapshot.
 *
 * JSON null reads as `none` too, not as the word "null". `{"notice": null}` and a snapshot with no
 * `notice` in it both mean the same thing to the member reading them -- there was nothing there --
 * and "null" is a developer's word for it. Flagged in task-3-report.md.
 */
function sideOf(value: unknown): string {
  if (absent(value)) return m.entry.changeNone;
  return typeof value === "string" ? m.entries.quoted(value) : JSON.stringify(value);
}

/**
 * `before` and `after` as one sentence. All three shapes the addendum names are real:
 *
 * - **both present** -- a clause per field, in `before`'s own order and then whatever `after` adds.
 * - **one present** -- the same, with `none` on the side that has nothing.
 * - **neither** -- the table's own em dash, because the row is drawn either way and an empty value
 *   beside a label reads as a value that failed to load.
 *
 * The columns are jsonb of any shape, so a snapshot that is not an object of fields (a scalar, an
 * array) has no field name to put in front of it and is drawn whole instead of dropped.
 */
function changeSentence(before: unknown, after: unknown): string {
  if (absent(before) && absent(after)) return m.entries.none;
  if (!isFields(before) && !isFields(after)) return m.entry.changedWhole(sideOf(before), sideOf(after));
  const fields = [...new Set([...(isFields(before) ? Object.keys(before) : []), ...(isFields(after) ? Object.keys(after) : [])])];
  if (fields.length === 0) return m.entries.none;
  return fields.map((field) => m.entry.changed(field, sideOf(isFields(before) ? before[field] : null), sideOf(isFields(after) ? after[field] : null))).join(" ");
}

/**
 * "Asha Rao · Owner · key “YubiKey 5C”" (:230), and the two cases the sheet never draws.
 *
 * `keyId` and `keyName` are not the same question. No `keyId` is an action taken without a key --
 * a System row, or one of the paths that never taps -- and gets no key clause at all. A `keyId`
 * whose `keyName` came back null is a key that has since been removed or reset away: the entry
 * still happened, so the clause stays and says the key is gone (task-3-addendum.md §2).
 */
function memberLine(entry: AuditEntryDetail): string {
  const parts = [
    entry.actorName,
    entry.actorRole ? f.roleLabel[entry.actorRole] : null,
    entry.keyId ? (entry.keyName === null ? m.entry.keyGone : m.entry.keyNamed(entry.keyName)) : null,
  ];
  return m.entry.memberLine(parts.filter((part): part is string => part !== null));
}

/** The sheet's nine `dt`/`dd` pairs, plus Environment second (see the note in messages). */
function fieldsOf(entry: AuditEntryDetail): readonly KeyValueItem[] {
  return [
    // To the second, unlike the table's own cell: two entries a few seconds apart are two
    // different actions, and the order between them is what the drawer is being read for.
    { label: m.entry.labels.time, value: `${formatDateTimeSeconds(entry.at)} ${ist}`, numeric: true },
    { label: m.entry.labels.environment, value: entry.environment },
    { label: m.entry.labels.member, value: memberLine(entry) },
    { label: m.entry.labels.action, value: entry.action },
    { label: m.entry.labels.target, value: entry.target ?? m.entries.none },
    { label: m.entry.labels.reason, value: entry.reason ? m.entries.quoted(entry.reason) : m.entries.none },
    // Plain text, not the table's Badge: the sheet's drawer draws "Done" bare (:234).
    { label: m.entry.labels.result, value: m.results[entry.result] },
    { label: m.entry.labels.address, value: entry.addressHash ?? m.entries.none, numeric: true },
    { label: m.entry.labels.session, value: entry.sessionLabel ?? m.entries.none },
    { label: m.entry.labels.change, value: changeSentence(entry.before, entry.after) },
  ];
}

/** Not drawn: the sheet draws the drawer open and full, never in flight. */
function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label={m.entry.loading} className="flex flex-col gap-5 px-5 py-2.5">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) => (
        <div key={row} className="flex items-center gap-4">
          <Skeleton className="h-3 w-[86px]" />
          <Skeleton className="h-3 grow" />
        </div>
      ))}
    </div>
  );
}

/**
 * The read itself: one request, one answer, and no state of its own. Kept out of the component so
 * the effect that calls it sets state from a callback rather than synchronously -- the shape
 * react.dev asks for, and the one eslint's react-hooks/set-state-in-effect enforces here.
 */
async function readEntry(id: string): Promise<State> {
  const result = await apiRequest(`/api/audit?id=${encodeURIComponent(id)}`, { method: "GET" }, responseShape);
  if (!result.ok) {
    // consoleApiMessage is the one thing that decides what a failed console request says
    // (task-2-addendum.md §7). The sheet gives this state no slot for it, so it is logged rather
    // than dropped -- a database refusal is a developer string and must never be shown.
    log.warn("[console] an audit entry could not be read", { message: consoleApiMessage(result.error) });
    return { kind: "error" };
  }
  return result.data.entry === null ? { kind: "missing" } : { kind: "ready", entry: result.data.entry };
}

export interface EntryDrawerProps {
  /** The entry to show, or `null` when the drawer is closed. The caller owns which row is open. */
  readonly entryId: string | null;
  readonly onClose: () => void;
}

/**
 * One audit entry, in full (AuditLog.dc.html:215-228): a 480px plate against the right edge, headed
 * `Audit entry` with the entry's id beside it, ten `dt`/`dd` pairs, and the retention line along
 * the bottom.
 *
 * **It reads `console_audit_entry`; it does not dress up the row the table already has.** The row
 * in hand carries sixteen keys and the drawer draws a seventeenth -- the key's *name*, which
 * `console.audit_log` does not store and which is resolved by a LEFT join the list deliberately
 * does not carry (task-3-addendum.md §2). Rendering from the row would mean showing a Member line
 * with no key clause on an entry that was taken with a key, which is the one thing this module must
 * not do.
 *
 * The read is inline here rather than in `src/console/audit/audit-client.ts`, for the reason
 * entries-plate.tsx already records: that file is Task 4's to create, and an empty one now is a
 * file two tasks fight over.
 *
 * Four states, because the read has four answers. `missing` is not an error: the function answers
 * SQL NULL for an id that is not there, with no database message to translate, and an empty drawer
 * is not an answer to give someone who followed a stale link (task-3-addendum.md §3).
 */
export function EntryDrawer({ entryId, onClose }: EntryDrawerProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Retry re-runs the effect below rather than reading on its own, the same shape
  // src/components/pnr/pnr-hash-result.tsx uses for the same job: one place does the read, and its
  // cleanup is what keeps a stale answer from painting.
  const [attempt, setAttempt] = useState(0);

  // A genuine change of entry resets to loading during render -- react.dev's own recommended shape
  // for adjusting state when a prop changes, and the one confirm-its-you.tsx already follows. In
  // the effect it would be a cascading render (eslint's react-hooks/set-state-in-effect says so);
  // left out altogether, the previous entry would sit on screen under the next entry's id while
  // its read was in flight, which is the one thing a record must never do.
  const [asked, setAsked] = useState(entryId);
  if (entryId !== asked) {
    setAsked(entryId);
    setAttempt(0);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    if (entryId === null) return;
    // `live`, not a request counter: React runs this cleanup before the next read starts, so an
    // answer to a row a member has already clicked past can never paint over the row they are on.
    let live = true;
    void readEntry(entryId).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [entryId, attempt]);

  if (entryId === null) return null;

  return (
    <BaseDialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-dialog bg-backdrop transition-opacity duration-(--duration-base) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Viewport className="fixed inset-0 z-dialog flex justify-end p-3">
          {/* The sheet's own drawer: 480px against the right edge, 12px clear of it on every side. */}
          <BaseDialog.Popup
            className={
              "blueprint flex w-[480px] max-w-full flex-col bg-surface-3 shadow-3 outline-none " +
              "transition-transform duration-(--duration-slow) ease-out-expo data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full"
            }
          >
            {/* :218's four `rm` marks: a blueprint object is its hairline and its registration
                marks at once, and the sheet draws them on this plate like any other. */}
            <Corners />
            <PlateHeader
              title={<BaseDialog.Title render={<span />}>{m.entry.title}</BaseDialog.Title>}
              headingLevel={2}
              meta={[
                // `whitespace-normal`, against the header cell's own nowrap: console.audit_log.id
                // is a uuid and the sheet's `#58213` is not, so it is let wrap rather than pushed
                // through the drawer's edge. Drawn as stored -- lower case, no `#`.
                <span key="id" className="tnum tracking-normal normal-case break-all">
                  {entryId}
                </span>,
              ]}
              actions={<BaseDialog.Close render={<IconButton label={messages.common.close} icon={<DismissRegular className="size-5" aria-hidden="true" />} size="sm" />} />}
            />

            {/* Scrolls, and the retention line below it does not: a long reason or a wide
                before/after must not push the one thing the drawer always says off the bottom. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {state.kind === "loading" ? (
                <Loading />
              ) : state.kind === "error" ? (
                <StateBlock
                  bare
                  role="alert"
                  title={m.error.title}
                  detail={m.error.detail}
                  actions={
                    <Button
                      onClick={() => {
                        setState({ kind: "loading" });
                        setAttempt((n) => n + 1);
                      }}
                    >
                      {m.error.action}
                    </Button>
                  }
                />
              ) : state.kind === "missing" ? (
                <StateBlock bare title={m.entry.missing.title} detail={m.entry.missing.detail} />
              ) : (
                // overflow-wrap is inherited, so one class on the list covers every value in it --
                // an address hash and a before/after block both break rather than scroll sideways,
                // exactly as industry.css's own `.kv > dd` does (:149).
                <KeyValueList className="px-5 [overflow-wrap:anywhere]" items={fieldsOf(state.entry)} />
              )}
            </div>

            <p className="seam px-5 py-3.5 text-sm leading-5 text-ink-3">{m.entry.retention}</p>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
