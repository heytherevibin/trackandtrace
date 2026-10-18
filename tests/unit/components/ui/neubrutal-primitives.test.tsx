import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Lamp } from "@/components/ui/led";
import { PlateHeader } from "@/components/ui/plate";
import { SWITCH_THUMB, SWITCH_TRACK } from "@/components/ui/switch";
import { cn } from "@/utils/cn";

// Neubrutal v4 (Claude Design, handoff/README.md component map): the primitives carry the face as nb: classes, which
// apply only under <html data-face="neubrutal">. The console renders the same primitives without the attribute, so
// every steel class stays in place beside them.

function classes(value: string): string[] {
  return value.split(/\s+/);
}

describe("Button, as .btn draws it", () => {
  it("gives every button the 2px edge, 3px radius, 44px target and Space Grotesk 700", () => {
    const c = classes(buttonClassName());
    for (const k of ["nb:border-2", "nb:rounded-control", "nb:min-h-11", "nb:font-structure", "nb:font-bold"]) expect(c).toContain(k);
  });

  it("draws the secondary on paper with the control shadow, pink on hover, pressing into its shadow", () => {
    const c = classes(buttonClassName({ variant: "secondary" }));
    for (const k of ["nb:bg-paper", "nb:shadow-control", "nb:hover:bg-pink", "nb:hover:text-on-fill", "nb-press"]) expect(c).toContain(k);
  });

  it("draws the primary in yellow, lime on hover", () => {
    const c = classes(buttonClassName({ variant: "primary" }));
    for (const k of ["nb:bg-accent", "nb:text-on-fill", "nb:hover:bg-lime", "nb:shadow-control", "nb-press"]) expect(c).toContain(k);
  });

  it("draws the ghost as an underlined link with no edge, no shadow and no press", () => {
    const c = classes(buttonClassName({ variant: "ghost" }));
    for (const k of ["nb:border-transparent", "nb:text-link", "nb:underline", "nb:decoration-2", "nb:underline-offset-3", "nb:hover:bg-accent"]) expect(c).toContain(k);
    expect(c).not.toContain("nb:shadow-control");
    expect(c).not.toContain("nb-press");
  });

  it("keeps the steel classes for the console", () => {
    expect(classes(buttonClassName({ variant: "primary" }))).toContain("bg-accent-strong");
  });

  it("survives class merging: nothing the face sets is dropped", () => {
    const merged = classes(cn(buttonClassName({ variant: "secondary" }), "w-full"));
    for (const k of ["nb:font-structure", "nb:font-bold", "nb:shadow-control", "nb:rounded-control", "nb:text-sm"]) expect(merged).toContain(k);
  });
});

describe("Badge, as .tag draws it", () => {
  it("gives every tag the edge, the mono caps legend and a 28px height", () => {
    const { container } = render(<Badge>Free</Badge>);
    const c = classes((container.firstElementChild as HTMLElement).className);
    for (const k of ["nb:border-2", "nb:border-edge", "nb:rounded-control", "nb:font-figure", "nb:uppercase", "nb:min-h-7", "nb:text-xs"]) expect(c).toContain(k);
  });

  it("fills the accent tag pink, as .tag.fill", () => {
    const { container } = render(<Badge variant="accent">Waitlist 18</Badge>);
    expect(classes((container.firstElementChild as HTMLElement).className)).toContain("nb:bg-pink");
  });

  it("draws outline and neutral tags on paper", () => {
    for (const variant of ["outline", "neutral", "steel"] as const) {
      const { container } = render(<Badge variant={variant}>x</Badge>);
      expect(classes((container.firstElementChild as HTMLElement).className)).toContain("nb:bg-paper");
    }
  });
});

describe("PlateHeader, as .hd draws it", () => {
  it("rules the header and each meta cell with the 2px edge, in Space Mono 700 caps", () => {
    const { container } = render(<PlateHeader title="PNR check" meta={["Form TL-01"]} />);
    const header = container.firstElementChild as HTMLElement;
    expect(classes(header.className)).toContain("nb:border-b-2");
    const [title, meta] = [...header.children] as HTMLElement[];
    for (const k of ["nb:font-figure", "nb:font-bold", "nb:text-ink-1"]) expect(classes(title!.className)).toContain(k);
    expect(classes(meta!.className)).toContain("nb:border-l-2");
  });
});

describe("Lamp, as .lamp draws it", () => {
  it("is a 12px ring with the 2px edge, lime when lit and orange while busy", () => {
    const lit = render(<Lamp lit />).container.firstElementChild as HTMLElement;
    for (const k of ["nb:size-3", "nb:border-2", "nb:border-edge", "nb:bg-lime"]) expect(classes(lit.className)).toContain(k);
    const busy = render(<Lamp busy />).container.firstElementChild as HTMLElement;
    expect(classes(busy.className)).toContain("nb:bg-orange");
  });
});

describe("Switch, as .switch draws it", () => {
  it("is a 44 × 24 edged track whose square thumb turns lime when on", () => {
    for (const k of ["nb:h-6", "nb:w-11", "nb:border-2", "nb:rounded-control", "nb:bg-paper", "nb:data-[checked]:bg-paper"]) expect(classes(SWITCH_TRACK)).toContain(k);
    for (const k of ["nb:size-4", "nb:bg-edge", "nb:data-[checked]:bg-lime"]) expect(classes(SWITCH_THUMB)).toContain(k);
  });
});

describe("IconButton, as the masthead's 40px keys", () => {
  it("draws a secondary icon key on paper with the control shadow", () => {
    const { container } = render(<IconButton label="Theme" icon={<span />} variant="secondary" />);
    const c = classes((container.firstElementChild as HTMLElement).className);
    for (const k of ["nb:border-2", "nb:rounded-control", "nb:bg-paper", "nb:shadow-control", "nb-press"]) expect(c).toContain(k);
  });
});
