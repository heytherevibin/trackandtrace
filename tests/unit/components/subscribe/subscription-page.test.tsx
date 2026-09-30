import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubscriptionPage } from "@/components/subscribe/subscription-page";
import { messages } from "@/messages";

describe("the subscription page shell", () => {
  it("draws the headline, the lead and the closing line", () => {
    render(
      <SubscriptionPage headline="Confirm your subscription" lead="Opening this link changed nothing.">
        <p>body</p>
      </SubscriptionPage>,
    );
    expect(screen.getByRole("heading", { name: "Confirm your subscription" })).toBeInTheDocument();
    expect(screen.getByText("Opening this link changed nothing.")).toBeInTheDocument();
    expect(screen.getByText(messages.subscribe.page.closing)).toBeInTheDocument();
  });

  it("draws no lead when there is none, so a finished page does not still give instructions", () => {
    // The board's rule: the lead belongs to the state before the press. Left standing it told a
    // reader who had just unsubscribed to press Unsubscribe.
    const { container } = render(
      <SubscriptionPage headline="Unsubscribe">
        <p>body</p>
      </SubscriptionPage>,
    );
    expect(screen.queryByText(/Opening this link/)).not.toBeInTheDocument();
    // An empty paragraph would still take its mt-3, so look for the element, not only the text.
    expect(container.querySelector("h1 + p")).toBeNull();
    expect(container.querySelector("h1")?.nextElementSibling?.className).toContain("blueprint");
  });

  it("makes the headline the page's one h1", () => {
    render(
      <SubscriptionPage headline="Unsubscribe">
        <p>body</p>
      </SubscriptionPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Unsubscribe" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("draws the children inside the plate, and the closing line after it", () => {
    const { container } = render(
      <SubscriptionPage headline="Unsubscribe" lead="Lead.">
        <p>body</p>
      </SubscriptionPage>,
    );
    const plate = container.querySelector(".blueprint");
    expect(plate).not.toBeNull();
    expect(plate).toContainElement(screen.getByText("body"));
    expect(plate).not.toContainElement(screen.getByText(messages.subscribe.page.closing));
    expect(plate?.nextElementSibling).toBe(screen.getByText(messages.subscribe.page.closing));
  });
});
