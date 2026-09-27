import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The frame meter's own chunk (J5-10): fetched only when the server allows it (JourneyOptions.hud) and the reader
// asks for it (?journey-hud). Mocking the module itself, rather than just its export, proves it was never even
// imported on the paths that must stay production-safe — not merely that startHud went uncalled.
const startHud = vi.fn(() => () => {});
vi.mock("@/components/landing/journey/hud", () => ({ startHud }));

import { startJourney } from "@/components/landing/journey/start-journey";

function setSearch(search: string): void {
  window.history.replaceState(null, "", `/${search}`);
}

describe("startJourney and the frame meter's chunk (J5-10)", () => {
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

  it("never imports the frame meter when the server does not allow it — the production path", async () => {
    setSearch("?journey-hud");
    stop = startJourney(); // JourneyLoader's default: no hud option, exactly what a production build passes
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
