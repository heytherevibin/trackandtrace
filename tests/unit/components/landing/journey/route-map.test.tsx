import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteMap } from "@/components/landing/journey/route-map";

describe("RouteMap", () => {
  it("draws the finished line: a numbered, passed stop per planned item, every sleeper laid, hidden from assistive tech", () => {
    const { container } = render(<RouteMap count={7} />);
    const map = container.querySelector(".route-map")!;
    expect(map).toHaveAttribute("aria-hidden", "true");
    expect(map.querySelectorAll(".route-stop")).toHaveLength(7);
    expect(map.querySelectorAll(".is-passed")).toHaveLength(7);
    expect([...map.querySelectorAll(".route-num")].map((n) => n.textContent)).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(map.querySelectorAll(".route-sleeper.is-laid").length).toBe(map.querySelectorAll(".route-sleeper").length);
  });
});
