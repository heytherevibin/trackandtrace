import { act, render } from "@testing-library/react";
import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlateMorph } from "@/components/pnr/plate-morph";

// The plate's face rises 8px only when it changes after mount, and only with Motion on (ruling J3-13). The
// first face never rises: not in the server's markup, not at hydration, whatever the Motion setting.

function Tree({ face }: { readonly face: string }): ReactNode {
  return (
    <LazyMotion features={domAnimation} strict>
      <PlateMorph face={face}>
        <p>{face}</p>
      </PlateMorph>
    </LazyMotion>
  );
}

const faceOf = (root: ParentNode): HTMLElement => root.querySelector<HTMLElement>(".plate-morph > div")!;

afterEach(() => {
  document.documentElement.removeAttribute("data-motion");
});

describe("the plate morph's first face", () => {
  it("carries no rise in the server's markup", () => {
    const html = renderToString(<Tree face="entry" />);
    expect(html).toContain("plate-morph");
    expect(html).not.toMatch(/translateY/);
  });

  it.each(["on", "off"] as const)("does not rise at hydration with Motion %s, and hydrates cleanly", async (motion) => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Tree face="entry" />);
    document.body.append(container);
    document.documentElement.setAttribute("data-motion", motion);
    const consoleError = vi.spyOn(console, "error");
    const recoverable: unknown[] = [];
    const root = await act(async () => hydrateRoot(container, <Tree face="entry" />, { onRecoverableError: (error) => recoverable.push(error) }));
    expect(recoverable).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    expect(faceOf(container).style.transform).not.toMatch(/translateY/);
    act(() => root.unmount());
    container.remove();
  });

  it("does not rise on a client-only first mount", () => {
    const { container } = render(<Tree face="record" />);
    expect(faceOf(container).style.transform).not.toMatch(/translateY/);
  });
});

describe("a change of face", () => {
  it.each([
    ["entry", "record"],
    ["record", "entry"],
  ] as const)("from %s to %s rises 8px with Motion on", (from, to) => {
    document.documentElement.setAttribute("data-motion", "on");
    const { container, rerender } = render(<Tree face={from} />);
    rerender(<Tree face={to} />);
    expect(faceOf(container).textContent).toBe(to);
    expect(faceOf(container).style.transform).toMatch(/translateY\(8px\)/);
  });

  it.each([
    ["entry", "record"],
    ["record", "entry"],
  ] as const)("from %s to %s swaps at once with Motion off", (from, to) => {
    document.documentElement.setAttribute("data-motion", "off");
    const { container, rerender } = render(<Tree face={from} />);
    rerender(<Tree face={to} />);
    expect(faceOf(container).textContent).toBe(to);
    expect(faceOf(container).style.transform).not.toMatch(/translateY/);
  });
});
