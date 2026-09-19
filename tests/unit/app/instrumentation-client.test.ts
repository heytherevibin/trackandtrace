import { describe, expect, it, vi } from "vitest";
import { globalConfig } from "zod/v4/core";

// The enforced CSP forbids eval. Zod probes for it (new Function) before compiling schemas, and a
// strict CSP reports that probe as a violation even though zod falls back; jitless skips the probe.

vi.mock("@sentry/nextjs", () => ({ init: vi.fn(), captureRouterTransitionStart: vi.fn() }));

describe("the browser bootstrap", () => {
  it("puts zod in jitless mode before any validation runs", async () => {
    await import("@/instrumentation-client");
    expect(globalConfig.jitless).toBe(true);
  });
});
