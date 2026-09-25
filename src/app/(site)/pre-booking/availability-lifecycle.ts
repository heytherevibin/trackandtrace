import type { TimelineStep } from "@/components/ui/timeline";
import { messages } from "@/messages";

// The four stops of a route search, derived from what the form actually knows. It is a pure
// function so the states the sheet draws can be asserted without rendering anything.
//
// The stops have moved with the flow twice. The first form validated a request it could not send,
// so its second stop was "Request validated". The second resolved ONE train, so its second stop
// was the train. This one resolves a whole route, so the second stop is the route — the thing
// without which no availability can be asked at all.

const S = messages.booking.stepStates;
const T = messages.booking.steps;

export type RoutePhase = "idle" | "looking" | "found" | "none" | "error";
export type ReadPhase = "idle" | "reading" | "ok" | "error";

export interface LifecycleInput {
  readonly route: RoutePhase;
  readonly read: ReadPhase;
  readonly from: string;
  readonly to: string;
  /** How many trains the route answered with, once it has answered. */
  readonly trains: number;
  /** The search that was sent, once one was. */
  readonly asked: { readonly classes: readonly string[]; readonly quota: string; readonly date: string } | null;
  /** How many trains came back with an answer. */
  readonly rows: number;
  readonly at: string;
  readonly hasDate: boolean;
}

function entered(input: LifecycleInput): TimelineStep {
  if (input.asked) return { id: "input", title: T.input, detail: S.asked(input.asked.classes.join(", "), input.asked.quota, input.asked.date), state: "done" };
  if (input.route === "looking") return { id: "input", title: T.input, detail: S.lookingUp, state: "current" };
  if (input.route === "found") return { id: "input", title: T.input, detail: input.hasDate ? S.waitingRequest : S.waitingDate, state: "current" };
  return { id: "input", title: T.input, detail: S.waitingRoute, state: "pending" };
}

function resolved(input: LifecycleInput): TimelineStep {
  if (input.route === "none") return { id: "train", title: T.train, detail: S.noTrains(input.from, input.to), state: "failed" };
  if (input.route === "found") return { id: "train", title: T.train, detail: S.chosen(input.trains, input.from, input.to), state: "done" };
  if (input.route === "looking") return { id: "train", title: T.train, detail: S.lookingUp, state: "current" };
  return { id: "train", title: T.train, detail: input.route === "error" ? S.none : S.waitingRoute, state: "pending" };
}

function chart(input: LifecycleInput): TimelineStep {
  if (input.read === "ok") return { id: "chart", title: T.chart, detail: S.returned(input.rows, input.at), state: "done" };
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
