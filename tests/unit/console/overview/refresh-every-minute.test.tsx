import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RefreshEveryMinute } from "@/console/overview/refresh-every-minute";

// The sheet's "refreshes every minute": the server page re-reads its figures, the client keeps its
// place. On the wall-clock minute, like the masthead's clock, so "Updated 14:32" and the clock agree.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T09:00:45Z"));
  refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("RefreshEveryMinute", () => {
  it("refreshes on the next wall-clock minute, then every minute after", () => {
    render(<RefreshEveryMinute />);
    vi.advanceTimersByTime(14_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops when the page goes away", () => {
    const { unmount } = render(<RefreshEveryMinute />);
    unmount();
    vi.advanceTimersByTime(180_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("draws nothing", () => {
    const { container } = render(<RefreshEveryMinute />);
    expect(container).toBeEmptyDOMElement();
  });
});
