import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfflineBanner } from "@/components/shell/offline-banner";

// v4: under the masthead, never over it — a red status strip while the device is offline, gone when it reconnects.

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

afterEach(() => setOnline(true));

describe("OfflineBanner", () => {
  it("draws nothing while the device is online", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so while offline, and goes when the connection returns", () => {
    render(<OfflineBanner />);
    act(() => setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent("Offline. Results cannot be fetched until the connection returns.");
    expect(screen.getByRole("status")).toHaveClass("bg-red", "text-on-red");
    act(() => setOnline(true));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
