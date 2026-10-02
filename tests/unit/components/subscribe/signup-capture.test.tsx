import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SignupCapture } from "@/components/subscribe/signup-capture";
import type { SignupState } from "@/components/subscribe/use-signup";
import { messages } from "@/messages";

const m = messages.subscribe;

function draw(over: Partial<React.ComponentProps<typeof SignupCapture>> = {}) {
  const signUp = vi.fn(async () => "sent" as const);
  render(<SignupCapture place="band" list="news" source="footer" signUp={signUp} {...over} />);
  return signUp;
}

describe("the sign-up capture", () => {
  it("asks for an email and offers to subscribe", () => {
    draw();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.form.subscribe })).toBeInTheDocument();
  });

  it("says Notify me under the pre-booking result, where the ask is different", () => {
    draw({ place: "pre-booking", list: "availability", source: "pre-booking" });
    expect(screen.getByRole("button", { name: m.form.notify })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: m.form.subscribe })).not.toBeInTheDocument();
    // The plate draws the intro (Task 5); the component must not, or `getByText` finds two.
    expect(screen.queryByText(m.places.preBooking)).not.toBeInTheDocument();
  });

  it("names the band's form for what it subscribes to; the plate has its own intro and stays unnamed", () => {
    const { container, unmount } = render(<SignupCapture place="band" list="news" source="footer" />);
    expect(container.querySelector("form")).toHaveAttribute("aria-label", m.places.footerColumn);
    unmount();
    const plate = render(<SignupCapture place="pre-booking" list="availability" source="pre-booking" />);
    expect(plate.container.querySelector("form")).not.toHaveAttribute("aria-label");
  });

  it("draws the field and the button in one row, in both places", () => {
    for (const place of ["band", "pre-booking"] as const) {
      const drawn = render(<SignupCapture place={place} list="news" source="footer" />);
      const button = drawn.container.querySelector("button");
      const field = drawn.container.querySelector("input");
      expect(button?.parentElement, place).not.toBe(button?.closest("form"));
      expect(button?.parentElement, place).toContainElement(field as HTMLElement);
      drawn.unmount();
    }
  });

  it("carries the consent line, with the privacy notice as a link", () => {
    draw();
    expect(screen.getByText(/We never sell your address/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: m.form.consent.link })).toHaveAttribute("href", "/privacy");
  });

  it("refuses an address that is not one without asking the server", async () => {
    const signUp = draw();
    await userEvent.type(screen.getByLabelText(m.form.label), "nope");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByText(m.errors.invalid)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("replaces the form with the same sentence whatever the server knew", async () => {
    const signUp = draw();
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(signUp).toHaveBeenCalledWith({ email: "asha@example.in", list: "news", source: "footer" });
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
    expect(screen.queryByLabelText(m.form.label)).not.toBeInTheDocument();
    // The consent line outlives the form.
    expect(screen.getByRole("link", { name: m.form.consent.link })).toBeInTheDocument();
  });

  it("sends the address trimmed and lowercased", async () => {
    const signUp = draw();
    await userEvent.type(screen.getByLabelText(m.form.label), "  Asha@Example.in ");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(signUp).toHaveBeenCalledWith({ email: "asha@example.in", list: "news", source: "footer" });
  });

  it("says it is sending, is busy while it does, and asks the server only once", async () => {
    let settle: (state: SignupState) => void = () => undefined;
    const signUp = vi.fn(
      () =>
        new Promise<SignupState>((resolve) => {
          settle = resolve;
        }),
    );
    draw({ signUp });
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    const busy = screen.getByRole("button", { name: m.form.sending });
    expect(busy).toHaveAttribute("aria-busy", "true");
    // The re-entry guard: a second press while the first is in flight must not ask again.
    await userEvent.click(busy);
    expect(signUp).toHaveBeenCalledOnce();
    await act(async () => settle("sent"));
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
  });

  it("does not leave the form stuck sending when the request itself throws", async () => {
    draw({ signUp: vi.fn(async () => Promise.reject(new Error("network"))) });
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByText(m.errors.failed)).toBeInTheDocument();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.form.subscribe })).toHaveAttribute("aria-busy", "false");
  });

  it.each([
    ["limited", m.errors.limited],
    ["dailyLimit", m.errors.dailyLimit],
    ["error", m.errors.failed],
  ] as const)("keeps the form standing and says why when the answer is %s", async (state, copy) => {
    // `draw` returns its own default spy, not the override, so the spy that is asserted on is built here.
    const signUp = vi.fn(async () => state);
    draw({ signUp });
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByLabelText(m.form.label)).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledOnce();
  });

  it("carries no error attributes until there is a message, then marks a mistyped address", async () => {
    draw();
    const field = screen.getByLabelText(m.form.label);
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).not.toHaveAttribute("aria-describedby");
    await userEvent.type(field, "nope");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByLabelText(m.form.label)).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(m.errors.invalid);
  });

  it("marks the field only when the address is the traveller's own mistake", async () => {
    // The board's rule: too many, daily limit and error are the site's trouble, and flagging an
    // address somebody typed correctly would say otherwise. All four still describe the field.
    draw({ signUp: vi.fn(async () => "limited" as const) });
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    await screen.findByText(m.errors.limited);
    expect(screen.getByLabelText(m.form.label)).toHaveAttribute("aria-invalid", "false");
  });
});
