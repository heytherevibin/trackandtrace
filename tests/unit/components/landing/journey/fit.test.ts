import { describe, expect, it } from "vitest";
import { fitsWindow } from "@/components/landing/journey/fit";

const pin = { top: 96, bottom: 900 };

describe("fitsWindow", () => {
  it("fits when every shown part sits inside the pin and above the window's foot", () => {
    expect(fitsWindow([{ top: 120, bottom: 700 }, { top: 110, bottom: 880 }], pin, 900)).toBe(true);
  });
  it("does not fit when a part runs past the window's foot, even inside the pin", () => {
    expect(fitsWindow([{ top: 120, bottom: 820 }], pin, 800)).toBe(false);
  });
  it("ignores a part that is not shown", () => {
    expect(fitsWindow([null, { top: 100, bottom: 400 }], pin, 900)).toBe(true);
  });
});
