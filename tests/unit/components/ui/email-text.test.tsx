import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmailText } from "@/components/ui/email-text";

/** The address as drawn, a break opportunity marked `|`. */
function drawn(container: HTMLElement): string {
  return [...(container.firstElementChild?.childNodes ?? [])].map((n) => (n.nodeName === "WBR" ? "|" : (n.textContent ?? ""))).join("");
}

describe("EmailText", () => {
  it("offers a line break after the @ and before each dot, and nowhere inside a word", () => {
    const { container } = render(<EmailText email="venkataramanan.subramanian@example.co.in" />);
    expect(drawn(container)).toBe("venkataramanan|.subramanian@|example|.co|.in");
  });

  it("reads, copies and announces as the one address", () => {
    const { container } = render(<EmailText email="asha@example.com" />);
    expect(container.textContent).toBe("asha@example.com");
  });

  it("breaks a long word only as the last resort, when it is wider than the whole line", () => {
    const { container } = render(<EmailText email="asha@example.com" />);
    expect(container.firstElementChild).toHaveClass("wrap-break-word");
  });
});
