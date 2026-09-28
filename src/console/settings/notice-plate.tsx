"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/plate";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { readWhen, type SaveResult } from "@/console/settings/limits-plate";
import { NOTICE_MAX, noticeChanges, type NoticeState } from "@/console/settings/notice";
import { saveNotice } from "@/console/settings/settings-client";
import { settingsTap } from "@/console/settings/settings-tap";
import { cn } from "@/utils/cn";

// PLATE "Switches", ROW "Site notice" (Console Switches.dc.html), transcribed. The other five rows
// the sheet draws read settings nothing on the traveller side consumes yet; a control that writes an
// audit row and changes nothing would tell an operator the site is doing something it is not. Each
// arrives with its wiring, as this one does.
//
// At 390 wide the sheet makes only PNR checks editable; this row reads "Open on a larger screen".

const m = consoleMessages.settings;
const s = m.switches;
const n = s.notice;

export type NoticeSave = (ask: { readonly on: boolean; readonly text: string; readonly noticeVersion: number | null; readonly version: number; readonly reason: string }) => Promise<SaveResult>;

type Stage = { readonly kind: "ready" } | { readonly kind: "confirming" } | { readonly kind: "saving" } | { readonly kind: "saved" } | { readonly kind: "failed"; readonly stale: boolean };

/** The strip as travellers see it (Notices.dc.html), drawn small: a lamp, the text, the close mark. */
function Preview({ text }: { readonly text: string }) {
  return (
    <div role="img" aria-label={n.preview(text)} className="border-line bg-accent-wash flex items-center gap-3 border px-3 py-2.5">
      <span aria-hidden className="border-line bg-accent inline-block size-[9px] shrink-0 rounded-full border" />
      <span className="flex-1 text-sm leading-5">{text}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-ink-2 shrink-0">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </div>
  );
}

export function NoticePlate({
  notice,
  rowVersion,
  environment,
  lastChanged,
  save = saveNotice,
}: {
  readonly notice: NoticeState;
  /** The settings row's version: the save refuses if another change landed first. */
  readonly rowVersion: number | null;
  readonly environment: string;
  /** From this setting's own last audit row, or null when it has never been changed here. */
  readonly lastChanged: { readonly at: string; readonly by: string } | null;
  readonly save?: NoticeSave;
}) {
  const router = useRouter();
  const [on, setOn] = useState(notice.on);
  const [text, setText] = useState(notice.text);
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const [refused, setRefused] = useState<string | null>(null);

  const changed = on !== notice.on || (on && text.trim() !== notice.text.trim());
  const when = lastChanged ? readWhen(lastChanged.at) : null;
  const lastLine = when !== null && lastChanged ? m.lastChanged(when, lastChanged.by) : m.neverChanged;
  const word = (v: boolean) => (v ? s.on : s.off);

  function onSave(): void {
    if (on && text.trim() === "") {
      setRefused(n.empty);
      return;
    }
    if (!changed) {
      setRefused(n.unchanged);
      return;
    }
    setRefused(null);
    setStage({ kind: "confirming" });
  }

  async function onConfirmed(): Promise<void> {
    if (rowVersion === null) {
      setStage({ kind: "failed", stale: false });
      return;
    }
    setStage({ kind: "saving" });
    const result = await save({ on, text: text.trim(), noticeVersion: notice.version, version: rowVersion, reason });
    if (result.ok) {
      setStage({ kind: "saved" });
      router.refresh();
      return;
    }
    setStage({ kind: "failed", stale: result.stale });
  }

  // The tap is minted over exactly what the route will save — built by the same function.
  const tap = on && text.trim() === "" ? null : settingsTap(environment, noticeChanges({ on, text, current: notice.version }));
  const change = on !== notice.on ? { label: n.name, before: word(notice.on), after: word(on) } : { label: n.textChange, before: notice.text, after: text.trim() };

  return (
    <>
      <Plate as="section" title={s.title} titleId="sw-switches" headingLevel={2} className="mt-6" padding="none">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-5 py-4">
          <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium">{n.name}</span>
              <span className="legend-sm border-line border px-1.5 py-0.5">{word(notice.on)}</span>
            </span>
            <span className="text-sm">{n.effect}</span>
            <span className="legend-sm">{lastLine}</span>

            <div className="mt-3 grid gap-4 max-sm:hidden md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sw-notice" className="legend-md text-accent-text">
                  {n.textLabel}
                </label>
                <textarea
                  id="sw-notice"
                  rows={2}
                  maxLength={NOTICE_MAX}
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                  className="border-line bg-surface-1 text-ink-1 w-full border px-2.5 py-1.5 text-sm"
                />
                <span className="text-label text-ink-3">{n.hint}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="legend-md text-accent-text">{n.previewLabel}</span>
                <Preview text={text.trim() === "" ? notice.text : text.trim()} />
              </div>
            </div>
            <p className="text-ink-1/70 mt-2 text-xs sm:hidden">{s.phoneOnly}</p>

            {refused === null ? null : <p className="text-closed-soft-ink mt-2 text-sm">{refused}</p>}
            {stage.kind === "saved" ? <p className="mt-2 text-sm">{m.state.saved(`${n.name} ${word(on)}`)}</p> : null}
            {stage.kind === "failed" ? <p className="text-closed-soft-ink mt-2 text-sm">{stage.stale ? m.state.stale : m.state.failed}</p> : null}
          </div>

          <div className="flex items-center gap-3 max-sm:hidden">
            <div role="group" aria-label={n.name} className="border-line flex border">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={on === value}
                  onClick={() => setOn(value)}
                  className={cn("min-h-9 min-w-14 px-3 text-sm", on === value ? "bg-accent-strong text-accent-ink" : "hover:bg-ink-1/5")}
                >
                  {word(value)}
                </button>
              ))}
            </div>
            <Button variant="secondary" disabled={!changed || stage.kind === "saving"} onClick={onSave}>
              {s.save}
            </Button>
          </div>
        </div>
      </Plate>

      <ConfirmItsYou
        open={stage.kind === "confirming" && tap !== null}
        action={tap?.action ?? ""}
        target={tap?.target ?? ""}
        value={tap?.value ?? ""}
        reason={reason}
        summary={n.summary}
        change={change}
        onReasonChange={setReason}
        onCancel={() => setStage({ kind: "ready" })}
        onConfirmed={() => void onConfirmed()}
      />
    </>
  );
}
