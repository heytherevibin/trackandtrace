import type { Engine } from "@/components/landing/journey/scene/engine";
import { keep, type JourneyContext } from "@/components/landing/journey/start-journey";

/** A journey's context for a unit test: Motion on, nothing kept yet, and an end that nothing reaches. */
export function testContext(overrides: Partial<JourneyContext> = {}): JourneyContext {
  return {
    motion: true,
    scene: keep<Promise<Engine> | null>(null),
    atEnd: () => undefined,
    ...overrides,
  };
}
