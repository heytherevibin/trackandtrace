import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteMotion } from "@/components/motion/site-motion";
import { MOTION_EVENT, applyMotion, chooseMotion, useMotion } from "@/components/motion/use-motion";

function Probe() {
  const { motion, deviceReduced } = useMotion();
  return <p data-testid="probe">{`${motion}${deviceReduced ? " by device" : ""}`}</p>;
}

/** A reduced-motion setting the test can change, calling listeners as a browser does. */
function deviceSetting(reduced: boolean): { readonly change: (next: boolean) => void } {
  const listeners = new Set<() => void>();
  const current = { reduced };
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === "(prefers-reduced-motion: reduce)" && current.reduced;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return {
    change: (next) => {
      current.reduced = next;
      for (const listener of listeners) listener();
    },
  };
}

const html = () => document.documentElement;

describe("the reader's Motion choice", () => {
  beforeEach(() => {
    html().setAttribute("data-motion", "on");
  });

  it("switched off: stored, written to <html>, and announced", () => {
    const heard = vi.fn();
    window.addEventListener(MOTION_EVENT, heard);
    chooseMotion(false);
    window.removeEventListener(MOTION_EVENT, heard);
    expect(window.localStorage.getItem("tt.motion")).toBe("off");
    expect(html()).toHaveAttribute("data-motion", "off");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("switched back on: forgotten, since on is the default", () => {
    chooseMotion(false);
    chooseMotion(true);
    expect(window.localStorage.getItem("tt.motion")).toBeNull();
    expect(html()).toHaveAttribute("data-motion", "on");
  });

  it("still stills this page when storage refuses the choice", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    chooseMotion(false);
    expect(html()).toHaveAttribute("data-motion", "off");
  });

  it("gives way to the device: reduced motion is off whatever is stored", () => {
    deviceSetting(true);
    expect(applyMotion()).toBe("off");
    expect(html()).toHaveAttribute("data-motion", "off");
  });

  it("is read by useMotion as the page shows it", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("on");
    act(() => chooseMotion(false));
    expect(screen.getByTestId("probe")).toHaveTextContent("off");
  });
});

describe("SiteMotion", () => {
  beforeEach(() => {
    html().setAttribute("data-motion", "on");
  });

  it("follows the device setting while the page is open", () => {
    const device = deviceSetting(false);
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    act(() => device.change(true));
    expect(html()).toHaveAttribute("data-motion", "off");
    expect(screen.getByTestId("probe")).toHaveTextContent("off by device");
    act(() => device.change(false));
    expect(html()).toHaveAttribute("data-motion", "on");
    expect(screen.getByTestId("probe")).toHaveTextContent(/^on$/);
  });

  it("follows the choice made in another tab", () => {
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    window.localStorage.setItem("tt.motion", "off");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "tt.motion", newValue: "off" }));
    });
    expect(html()).toHaveAttribute("data-motion", "off");
  });

  it("follows a store cleared in another tab", () => {
    html().setAttribute("data-motion", "off");
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    window.localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(html()).toHaveAttribute("data-motion", "on");
  });

  it("writes <html data-motion> only when something changes, never on mount", () => {
    // The stored choice disagrees with the attribute on purpose: had SiteMotion written on mount, it would read off.
    window.localStorage.setItem("tt.motion", "off");
    render(
      <SiteMotion>
        <Probe />
      </SiteMotion>,
    );
    expect(html()).toHaveAttribute("data-motion", "on");
  });
});
