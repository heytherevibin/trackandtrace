import { messages } from "@/messages";
import type { AvailabilityAnswer, AvailabilityDayRecord, AvailabilityOutcome, AvailabilityRequest, AvailabilitySource } from "@/services/availability-source";
import { unavailable } from "./outcome";

// ---------------------------------------------------------------------------
// Sample availability, so every drawn state can be reached with no provider and
// no network — the sibling of `fixture.ts` and `fixture-route.ts`, under the
// same rule: only when the fixture source is chosen, never in production, and
// always behind the app's "Sample data" label.
//
// The train number picks the state, the way a fixture PNR picks a status. Each
// one exists because the sheet draws it and something has to drive it:
//
//   12627  availability returned — one AVAILABLE day, then a queue that moves
//   22691  booking closed        — today's row is WAITLIST with canBook false
//   12345  nothing returned      — the provider refuses, and it must NOT read
//                                  as a sold-out train
//
// That last one is the whole reason this file has a refusal at all. A fixture
// that can only succeed cannot prove the failure path stays a failure.
// ---------------------------------------------------------------------------

/** IST, so a "today" row in sample data lines up with the clock the site prints. */
function istDay(offset: number, now: Date): string {
  const shifted = new Date(now.getTime() + 330 * 60_000 + offset * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

function day(date: string, status: string, text: string, raw: string, canBook: boolean, extra: Partial<AvailabilityDayRecord> = {}): AvailabilityDayRecord {
  return {
    date,
    status,
    availabilityText: text,
    rawStatus: raw,
    canBook,
    wlBooking: null,
    wlCurrent: null,
    seats: null,
    prediction: null,
    predictionPercentage: null,
    ...extra,
  };
}

function karnataka(now: Date): AvailabilityAnswer {
  return {
    train: { no: "12627", name: "KARNATAKA EXP", fromName: "KSR BENGALURU", toName: "NEW DELHI", distanceKm: 2444 },
    fare: { base: 2530, reservation: 40, superfast: 45, gst: 355, total: 2970 },
    days: [
      day(istDay(20, now), "AVAILABLE", "AVAILABLE", "AVAILABLE", true),
      day(istDay(21, now), "WAITLIST", "GNWL84", "GNWL244/WL84", true, { wlBooking: 244, wlCurrent: 84 }),
      day(istDay(22, now), "WAITLIST", "GNWL136", "GNWL244/WL136", true, { wlBooking: 244, wlCurrent: 136 }),
      day(istDay(24, now), "WAITLIST", "GNWL244", "GNWL244/WL244", true, { wlBooking: 244, wlCurrent: 244 }),
    ],
    retrievedAt: now.toISOString(),
  };
}

function janShatabdi(now: Date): AvailabilityAnswer {
  return {
    train: { no: "22691", name: "RAJDHANI EXP", fromName: "KSR BENGALURU", toName: "NEW DELHI", distanceKm: 2365 },
    fare: { base: 640, reservation: 40, superfast: 45, gst: 40, total: 765 },
    days: [
      // The state the crawler found on its first real run: a queue you cannot join.
      day(istDay(0, now), "WAITLIST", "GNWL12", "GNWL136/WL12", false, { wlBooking: 136, wlCurrent: 12 }),
      day(istDay(1, now), "AVAILABLE", "AVAILABLE", "AVAILABLE", true),
      day(istDay(2, now), "WAITLIST", "GNWL55", "GNWL136/WL55", true, { wlBooking: 136, wlCurrent: 55 }),
      day(istDay(3, now), "WAITLIST", "GNWL84", "GNWL244/WL84", true, { wlBooking: 244, wlCurrent: 84 }),
    ],
    retrievedAt: now.toISOString(),
  };
}

const ANSWERS: Readonly<Record<string, (now: Date) => AvailabilityAnswer>> = {
  "12627": karnataka,
  "22691": janShatabdi,
};

export const fixtureAvailabilitySource: AvailabilitySource = {
  async check(request: AvailabilityRequest): Promise<AvailabilityOutcome> {
    const build = ANSWERS[request.trainNo.trim()];
    // Not a sample train: the sample provider could not answer. Never an empty day list, which is
    // the one shape that would read as "there are no berths".
    if (!build) return unavailable(messages.source.availability.couldNotAnswer, "server");
    return { ok: true, answer: build(new Date()) };
  },
};
