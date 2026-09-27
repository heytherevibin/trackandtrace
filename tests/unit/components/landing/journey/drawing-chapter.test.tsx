import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DrawingChapter } from "@/components/landing/journey/drawing-chapter";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { TerminusStage } from "@/components/landing/journey/terminus-stage";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { messages } from "@/messages";

describe("the drawing chapter (GA)", () => {
  it("is a section named by its heading, with GA's anchor", () => {
    render(<DrawingChapter />);
    expect(screen.getByRole("region", { name: "Every part answers to the source" }).id).toBe("anatomy");
  });

  it("keeps its copy's parts in the labels' order", () => {
    expect(messages.home.drawing.parts.map((p) => p.id)).toEqual([...CALLOUT_PARTS]);
  });

  it("says what each part does in one real list, leading end right, trailing end left", () => {
    render(<DrawingChapter />);
    const items = within(screen.getByRole("list", { name: "What each part does" })).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.part)).toEqual([...CALLOUT_PARTS]);
    expect(items.map((li) => li.dataset.side)).toEqual(["right", "right", "right", "right", "right", "left", "left", "left", "left", "left"]);
    expect(items[0]).toHaveTextContent("01Leading pantographOne live request · asked the moment you press Run");
    expect(items[9]).toHaveTextContent("10Trailing wheelsetsNo account · a check needs only the PNR");
  });

  it("keeps the drawing, the leaders, the legend and the title block from assistive tech", () => {
    const { container } = render(<DrawingChapter />);
    for (const selector of [".anatomy-still", ".callout-lines", ".anatomy-legend", ".title-block"]) {
      expect(container.querySelector(selector), selector).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("gives the live drawing a stage, its two dimension figures and its caption; the stage and figures are decoration", () => {
    const { container } = render(<DrawingChapter />);
    expect(container.querySelector(".anatomy-stage")?.getAttribute("aria-hidden")).toBe("true");
    const dims = [...container.querySelectorAll<HTMLElement>(".dim-label")];
    expect(dims.map((d) => [d.dataset.dim, d.textContent, d.getAttribute("aria-hidden")])).toEqual([
      ["length", "≈ 20 560 mm", "true"],
      ["height", "≈ 4 255 mm", "true"],
    ]);
    expect(container.querySelector(".anatomy-caption")).toHaveTextContent("Scroll · the drawing turns, comes apart, couples up and departs");
  });

  it("sends a page with JavaScript no still file, and a page without it only the wide drawing (§3.H's budget)", () => {
    const html = renderToString(<DrawingChapter />);
    const [page, noscript = ""] = html.split("<noscript>");
    expect(page).not.toContain("/journey/");
    expect(noscript).toContain(`${STILL_MANIFEST.shapes.anatomyWide.href}#shell`);
    expect(html).not.toContain(STILL_MANIFEST.shapes.anatomyTall.href);
  });
});

describe("the terminus stage", () => {
  it("captions the arrived train and keeps it from assistive tech", () => {
    const { container } = render(<TerminusStage />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveTextContent("Terminus · the check starts here");
  });

  it("sends the terminus drawing only to a page without JavaScript, wide only (§3.H's budget)", () => {
    const html = renderToString(<TerminusStage />);
    const [page, noscript = ""] = html.split("<noscript>");
    expect(page).not.toContain("/journey/");
    expect(noscript).toContain(STILL_MANIFEST.shapes.terminusWide.href);
    expect(html).not.toContain(STILL_MANIFEST.shapes.terminusTall.href);
  });
});
