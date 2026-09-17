import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultActions } from "@/components/pnr/result-actions";

const handlers = () => ({ onRefresh: vi.fn(), onShare: vi.fn(), onToggleSave: vi.fn() });

describe("ResultActions", () => {
  it("offers Refresh and Share as hairline buttons and Save as the one primary", () => {
    const h = handlers();
    render(<ResultActions refreshing={false} saved={false} saving={false} {...h} />);
    const save = screen.getByRole("button", { name: "Save to watchlist" });
    expect(save).toHaveAttribute("aria-pressed", "false");
    expect(save).toHaveClass("bg-accent-strong");
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass("border-line");
    expect(screen.getByRole("button", { name: "Share" })).toHaveClass("border-line");
    fireEvent.click(screen.getByTestId("refresh"));
    fireEvent.click(screen.getByTestId("share-result"));
    fireEvent.click(save);
    expect(h.onRefresh).toHaveBeenCalledOnce();
    expect(h.onShare).toHaveBeenCalledOnce();
    expect(h.onToggleSave).toHaveBeenCalledOnce();
  });

  it("turns Save into a pressed secondary Saved once the PNR is on the watchlist", () => {
    render(<ResultActions refreshing={false} saved saving={false} {...handlers()} />);
    const saved = screen.getByTestId("save-watchlist");
    expect(saved).toHaveTextContent("Saved");
    expect(saved).toHaveAttribute("aria-pressed", "true");
    expect(saved).not.toHaveClass("bg-accent-strong");
  });

  it("marks Refresh busy while the source is re-queried", () => {
    render(<ResultActions refreshing saved={false} saving={false} {...handlers()} />);
    expect(screen.getByTestId("refresh")).toHaveAttribute("aria-busy", "true");
  });
});
