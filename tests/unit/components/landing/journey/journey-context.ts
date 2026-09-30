import type { ResultDetail } from "@/components/landing/journey/journey-events";
import type { Engine } from "@/components/landing/journey/scene/engine";
import { keep, type JourneyContext, type StillPlace } from "@/components/landing/journey/start-journey";

/** A journey's context for a unit test: Motion on, no intro, nothing kept yet, and an end that nothing reaches. */
export function testContext(overrides: Partial<JourneyContext> = {}): JourneyContext {
  return {
    motion: true,
    intro: false,
    result: keep<ResultDetail | null>(null),
    still: keep<StillPlace>({ columns: false, height: null }),
    scene: keep<Promise<Engine> | null>(null),
    played: keep<ReadonlySet<string>>(new Set()),
    atEnd: () => undefined,
    ...overrides,
  };
}
