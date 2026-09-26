import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StillDrawing } from "@/components/landing/journey/still-drawing";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";

let wide = true;
const changes = new Set<() => void>();
const html = document.documentElement;

beforeEach(() => {
  wide = true;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      get matches() {
        return wide;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => changes.add(listener),
      removeEventListener: (_: string, listener: () => void) => changes.delete(listener),
    }),
  });
});

afterEach(() => {
  html.removeAttribute("data-drawing");
  html.removeAttribute("data-journey");
  changes.clear();
});

const hrefs = (root: HTMLElement) => [...root.querySelectorAll("use")].flatMap((u) => u.getAttribute("href") ?? []);
const all = (name: "anatomyWide" | "anatomyTall") => STILL_MANIFEST.shapes[name].parts.map((p) => `${STILL_MANIFEST.shapes[name].href}#${p}`);

describe("StillDrawing", () => {
  it("fetches nothing while the drawing is live", () => {
    html.setAttribute("data-drawing", "live");
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    expect(hrefs(container)).toEqual([]);
  });

  it("draws every part of the wide shape once the page draws still", async () => {
    html.setAttribute("data-drawing", "live");
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    await act(async () => html.setAttribute("data-drawing", "still"));
    expect(hrefs(container)).toEqual(all("anatomyWide"));
  });

  it("draws the tall shape on a narrow screen, and follows the width", async () => {
    wide = false;
    html.setAttribute("data-drawing", "still");
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    expect(hrefs(container)).toEqual(all("anatomyTall"));
    wide = true;
    await act(async () => changes.forEach((change) => change()));
    expect(hrefs(container)).toEqual(all("anatomyWide"));
  });

  it("draws still when the journey failed, whatever the head script guessed", async () => {
    html.setAttribute("data-drawing", "live");
    const { container } = render(<StillDrawing kind="terminus" className="terminus-still" />);
    await act(async () => html.setAttribute("data-journey", "failed"));
    expect(hrefs(container)).toHaveLength(STILL_MANIFEST.shapes.terminusWide.parts.length);
  });

  it("is decoration", () => {
    const { container } = render(<StillDrawing kind="anatomy" className="anatomy-still" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
