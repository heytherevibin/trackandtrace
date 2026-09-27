import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The frame meter's own chunk (J5-10): fetched only when the server allows it (JourneyOptions.hud) and the reader
// asks for it (?journey-hud). This file proves only the client half of that gate — whether startJourney imports
// the chunk given a `hud` option and a URL — by mocking the module itself, rather than just its export, so the
// assertion is that it was never even imported. The server's own decision (VERCEL_ENV/NODE_ENV -> hud, wired in
// page.tsx) is proved separately, on the pure hudAllowed(), in hud.test.tsx.
const startHud = vi.fn(() => () => {});
vi.mock("@/components/landing/journey/hud", () => ({ startHud }));

import { startJourney } from "@/components/landing/journey/start-journey";

function setSearch(search: string): void {
  window.history.replaceState(null, "", `/${search}`);
}

describe("startJourney and the frame meter's chunk — the client half of the gate (J5-10)", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-journey");
    startHud.mockClear();
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    setSearch("");
  });

  it("never imports the frame meter when `hud` is not passed, whatever the URL asks for", async () => {
    setSearch("?journey-hud");
    stop = startJourney(); // JourneyLoader's default when the server's hudAllowed() says no — see hud.test.tsx
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(startHud).not.toHaveBeenCalled();
  });

  it("never imports the frame meter without ?journey-hud, even when the server allows it", async () => {
    setSearch("");
    stop = startJourney({ hud: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(startHud).not.toHaveBeenCalled();
  });

  it("imports the frame meter once, when the server allows it and the reader asks for it", async () => {
    setSearch("?journey-hud");
    stop = startJourney({ hud: true });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(startHud).toHaveBeenCalledTimes(1);
  });
});
