import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STILL_MANIFEST } from "@/components/landing/journey/still-manifest";
import { TerminusStage } from "@/components/landing/journey/terminus-stage";

// The terminus (the journey's one kept stage, 2026-10-18): the train arrived above the closing plate.
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
