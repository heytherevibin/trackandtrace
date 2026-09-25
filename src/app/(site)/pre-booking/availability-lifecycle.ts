import type { TimelineStep } from "@/components/ui/timeline";
import { messages } from "@/messages";

// The four stops of an availability request, derived from what the form actually knows. It is a
// pure function so the states the sheet draws can be asserted without rendering anything.
//
// The stops changed with the flow: the old form validated a request it could not send, so its
// second stop was "Request validated". Now the second stop is the train — the thing the route
// lookup resolves and the thing without which the chart cannot be read.

const S = messages.booking.stepStates;
const T = messages.booking.steps;

export type RoutePhase = "idle" | "looking" | "found" | "none" | "error";
export type ReadPhase = "idle" | "reading" | "ok" | "error";

export interface LifecycleInput {
  readonly route: RoutePhase;
  readonly read: ReadPhase;
  readonly from: string;
  readonly to: string;
  /** The chosen train, once the route has answered and one is picked. */
  readonly train: { readonly name: string; readonly fromCode: string; readonly toCode: string } | null;
  readonly asked: { readonly trainNo: string; readonly cls: string; readonly quota: string; readonly date: string } | null;
  readonly days: number;
  readonly at: string;
  readonly hasDate: boolean;
}

function entered(input: LifecycleInput): TimelineStep {
  if (input.asked) return { id: "input", title: T.input, detail: S.asked(input.asked.trainNo, input.asked.cls, input.asked.quota, input.asked.date), state: "done" };
  if (input.route === "looking") return { id: "input", title: T.input, detail: S.lookingUp, state: "current" };
  if (input.train) return { id: "input", title: T.input, detail: input.hasDate ? S.waitingRequest : S.waitingDate, state: "current" };
  return { id: "input", title: T.input, detail: input.route === "found" ? S.waitingTrain : S.waitingRoute, state: "pending" };
}

function resolved(input: LifecycleInput): TimelineStep {
  if (input.route === "none") return { id: "train", title: T.train, detail: S.noTrains(input.from, input.to), state: "failed" };
  if (input.train) return { id: "train", title: T.train, detail: S.chosen(input.train.name, input.train.fromCode, input.train.toCode), state: "done" };
  if (input.route === "looking") return { id: "train", title: T.train, detail: S.lookingUp, state: "current" };
  return { id: "train", title: T.train, detail: input.route === "error" ? S.none : S.waitingRoute, state: "pending" };
}

function chart(input: LifecycleInput): TimelineStep {
  if (input.read === "ok") return { id: "chart", title: T.chart, detail: S.returned(input.days, input.at), state: "done" };
  if (input.read === "error") return { id: "chart", title: T.chart, detail: S.refused(input.at), state: "failed" };
  if (input.read === "reading") return { id: "chart", title: T.chart, detail: S.reading, state: "current" };
  if (input.route === "none") return { id: "chart", title: T.chart, detail: S.notReached, state: "pending" };
  return { id: "chart", title: T.chart, detail: S.waitingRequest, state: "pending" };
}

function result(input: LifecycleInput): TimelineStep {
  if (input.read === "ok") return { id: "result", title: T.result, detail: S.shownAbove, state: "done" };
  if (input.read === "error") return { id: "result", title: T.result, detail: S.tryAgain, state: "pending" };
  if (input.route === "none") return { id: "result", title: T.result, detail: S.none, state: "pending" };
  return { id: "result", title: T.result, detail: S.waitingRequest, state: "pending" };
}

export function lifecycleSteps(input: LifecycleInput): readonly TimelineStep[] {
  return [entered(input), resolved(input), chart(input), result(input)];
}
