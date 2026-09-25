import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "@/components/landing/how-it-works";
import { buildSpecimen, chapterTrace } from "@/components/landing/specimen-data";

const trace = chapterTrace(buildSpecimen(new Date("2026-09-17T06:30:00.000Z"))!);

describe("02 · How it works", () => {
  it("keeps its words as they were: a heading and three stops", () => {
    render(<HowItWorks trace={trace} />);
    const section = screen.getByRole("region", { name: /three stops/i });
    const stops = within(section).getAllByRole("listitem");
    expect(stops.map((li) => li.getAttribute("data-chapter"))).toEqual(["0", "1", "2"]);
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("draws the chapters instrument as decoration, with the specimen's trace", () => {
    const { container } = render(<HowItWorks trace={trace} />);
    const instrument = container.querySelector(".chapters-instrument");
    expect(instrument).toHaveAttribute("aria-hidden", "true");
    expect(instrument?.querySelectorAll(".chapters-dial .dial-seg")).toHaveLength(10);
    expect(instrument?.querySelectorAll(".chapter-arc")).toHaveLength(3);
    expect(instrument?.querySelectorAll("[data-layer]")).toHaveLength(3);
    expect(instrument?.querySelector("svg")).toHaveAttribute("data-pnr", "2345678909");
    expect(instrument?.querySelector('pre[data-card="0"]')).toHaveTextContent("PNR 234 567 8909");
    expect(instrument?.querySelector('pre[data-card="2"]')).toHaveTextContent("three passengers");
    expect(instrument?.querySelector('[data-layer="0"]')).toHaveClass("is-current");
  });

  it("draws no instrument without a specimen", () => {
    const { container } = render(<HowItWorks trace={null} />);
    expect(container.querySelector(".chapters-instrument")).toBeNull();
  });
});
