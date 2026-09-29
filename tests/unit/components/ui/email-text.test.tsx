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

  it("adds nothing to the address: its text is the address, split only by <wbr>, no wrapping element and no character", () => {
    const { container } = render(<EmailText email="asha@example.com" />);
    const span = container.firstElementChild;
    expect(span?.textContent).toBe("asha@example.com");
    expect([...(span?.children ?? [])].map((child) => child.tagName)).toEqual(["WBR", "WBR"]);
    // How it reads in the accessibility tree and when it is copied: tests/e2e/account-identity.spec.ts.
  });

  it("breaks a long word only as the last resort, when it is wider than the whole line", () => {
    const { container } = render(<EmailText email="asha@example.com" />);
    expect(container.firstElementChild).toHaveClass("wrap-break-word");
  });
});
