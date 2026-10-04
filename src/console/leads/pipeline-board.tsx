"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StateBlock } from "@/components/ui/state-block";
import { notify } from "@/components/ui/toast";
import { BUSINESS_STAGES, daysInStage, initialsOf, type BusinessStage } from "@/console/leads/business";
import type { PipelineCard } from "@/console/leads/business-leads";
import { leadRecordHref } from "@/console/leads/filters";
import { requestMoveBusiness } from "@/console/leads/leads-client";
import { PIPELINE_HREF } from "@/console/leads/leads-tabs";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.leads;
const b = m.business;
const p = b.board;

/**
 * The Business pipeline board (ConsoleLeads.dc.html, Pipeline and Pipeline: empty; the phone board's
 * stacked columns).
 *
 * FIVE COLUMNS FROM `xl`, the last two narrower, as drawn. Below that there is no room for five
 * beside the rail, so the stages run two across; on a phone, one. The order never changes.
 *
 * A LEAD MOVES WITH ITS STAGE PICKER (decided with the owner: no dragging). The pick is sent as it
 * is made and the board is re-read from the server either way, so a card is never drawn in a stage
 * the database does not hold it in.
 *
 * ON A PHONE THE BOARD IS READ AND NOTHING MOVES: the picker is not drawn, and the whole card opens
 * the record, as the phone board draws it.
 *
 * `cards` is `null` when the board could not be read. It is never drawn as "no business leads".
 * `now` is the server's reading of the clock, so the page it rendered and the page that hydrates
 * count the same days.
 */
export function PipelineBoard({ cards, now, action }: { readonly cards: readonly PipelineCard[] | null; readonly now: string; readonly action?: ReactNode }) {
  const router = useRouter();
  const [moving, setMoving] = useState<string | null>(null);

  if (cards === null) {
    return <StateBlock role="alert" title={p.unavailableTitle} detail={p.unavailableDetail} className="max-w-[720px]" actions={<Button onClick={() => router.refresh()}>{p.retry}</Button>} />;
  }
  if (cards.length === 0) {
    return (
      <StateBlock
        title={p.noneTitle}
        className="max-w-[720px]"
        detail={
          <>
            <span className="max-sm:hidden">{p.noneDetail}</span>
            <span className="sm:hidden">{p.noneDetailPhone}</span>
          </>
        }
        actions={action ? <div className="max-sm:hidden">{action}</div> : undefined}
      />
    );
  }

  async function move(card: PipelineCard, stage: BusinessStage): Promise<void> {
    setMoving(card.id);
    const outcome = await requestMoveBusiness(card.id, stage);
    setMoving(null);
    if (outcome.kind === "failed") notify.error(outcome.message);
    // After a refusal too: a lead is refused when it has already left the pipeline, and the board should show that.
    router.refresh();
  }

  const at = new Date(now);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_0.74fr_0.74fr] xl:items-start">
      {BUSINESS_STAGES.map((stage) => {
        const here = cards.filter((card) => card.stage === stage);
        return (
          <section key={stage} aria-label={b.stages[stage]} className="flex min-w-0 flex-col gap-2.5 max-sm:gap-2">
            <div className="border-line-strong flex items-baseline gap-2 border-b pb-2">
              <h2 className="legend text-ink-1">{b.stages[stage]}</h2>
              <span className="legend-sm tnum">{here.length}</span>
            </div>
            {here.length === 0 ? (
              <p className="border-line-strong text-ink-3 text-label border border-dashed px-3.5 py-4 leading-5">{p.empty}</p>
            ) : (
              here.map((card) => {
                const days = daysInStage(card.stageSince, at);
                return (
                  <article key={card.id} className="border-line bg-surface-2 relative flex flex-col gap-2 border px-3.5 py-3 max-sm:gap-1.5">
                    {/* Below `sm` the link's box is the whole card, as the phone board draws one link per card. */}
                    <Link
                      href={leadRecordHref(PIPELINE_HREF, card.id)}
                      prefetch={false}
                      aria-label={m.table.open(card.email)}
                      className="text-accent-text max-sm:text-body max-sm:text-ink-1 text-sm font-medium leading-5 underline-offset-4 [overflow-wrap:anywhere] hover:underline max-sm:no-underline max-sm:after:absolute max-sm:after:inset-0"
                    >
                      {card.email}
                    </Link>
                    <p className="text-ink-2 text-label leading-5 max-sm:text-sm">{card.about}</p>
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" title={card.ownerName ?? b.nobody} className="border-line bg-surface-1 font-display text-2xs inline-flex size-6 items-center justify-center border font-semibold">
                        {card.ownerName ? initialsOf(card.ownerName) : m.table.blank}
                      </span>
                      <span className="sr-only">{p.ownedBy(card.ownerName ?? b.nobody)}</span>
                      <span className="legend-sm tnum">{days === 0 ? p.today : p.days(days)}</span>
                    </div>
                    <NativeSelect
                      aria-label={p.stageOf(card.email)}
                      className="max-sm:hidden"
                      disabled={moving !== null}
                      value={card.stage}
                      onChange={(event) => {
                        const next = BUSINESS_STAGES.find((one) => one === event.target.value);
                        if (next && next !== card.stage) void move(card, next);
                      }}
                      options={BUSINESS_STAGES.map((one) => ({ value: one, label: b.stages[one] }))}
                    />
                  </article>
                );
              })
            )}
          </section>
        );
      })}
    </div>
  );
}
