import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));

import { UpdatesBand } from "@/components/shell/updates-band";

const m = messages.subscribe;

function draw(path: string) {
  at.path = path;
  return render(<UpdatesBand />);
}

function sent() {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ ok: true, message: m.sent }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("the Updates by email band", () => {
  it("is a section named by its heading, an h2, with the promise, the form and the consent line", () => {
    draw("/");
    const band = screen.getByRole("region", { name: m.places.footerColumn });
    expect(within(band).getByRole("heading", { level: 2, name: m.places.footerColumn })).toBeInTheDocument();
    expect(within(band).getByText(m.promise.news)).toBeInTheDocument();
    expect(within(band).getByLabelText(m.form.label)).toBeInTheDocument();
    expect(within(band).getByRole("button", { name: m.form.subscribe })).toBeInTheDocument();
    expect(within(band).getByRole("link", { name: m.form.consent.link })).toHaveAttribute("href", "/privacy");
  });

  it("names its form for what it subscribes to, so a second Email field on the page is never confused with it", () => {
    draw("/account");
    expect(screen.getByRole("form", { name: m.places.footerColumn })).toContainElement(screen.getByLabelText(m.form.label));
  });

  it("is full on the landing and slim on an app page, the same band", () => {
    const full = draw("/");
    expect(screen.getByRole("region", { name: m.places.footerColumn })).toHaveAttribute("data-variant", "full");
    full.unmount();
    draw("/watchlist");
    const slim = screen.getByRole("region", { name: m.places.footerColumn });
    expect(slim).toHaveAttribute("data-variant", "slim");
    expect(within(slim).getByRole("heading", { level: 2, name: m.places.footerColumn })).toBeInTheDocument();
    expect(within(slim).getByText(m.promise.news)).toBeInTheDocument();
  });

  it.each(["/subscribe/confirm", "/unsubscribe", "/login", "/pre-booking", "/offline"])("draws nothing on %s", (path) => {
    const { container } = draw(path);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only words that are already in the messages", () => {
    const { container } = draw("/");
    const expected = [m.places.footerColumn, m.promise.news, m.form.label, m.form.subscribe, m.form.consent.text.trim(), m.form.consent.link];
    const drawn = [...container.querySelectorAll("h2, p, label, button, a")].map((el) => el.textContent?.trim());
    expect(drawn).toEqual([m.places.footerColumn, m.promise.news, m.form.label, m.form.subscribe, `${m.form.consent.text}${m.form.consent.link}`.trim(), m.form.consent.link]);
    for (const word of expected) expect(container.textContent).toContain(word);
  });

  it("starts afresh on every page: an address typed on one page does not follow the reader to the next", async () => {
    // The band lives in the layout, which a client navigation keeps mounted.
    const drawn = draw("/");
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    expect(screen.getByLabelText(m.form.label)).toHaveValue("asha@example.in");
    at.path = "/watchlist";
    drawn.rerender(<UpdatesBand />);
    expect(screen.getByLabelText(m.form.label)).toHaveValue("");
  });

  it("starts afresh on every page: a refusal or the sent line does not follow the reader either", async () => {
    const drawn = draw("/watchlist");
    await userEvent.type(screen.getByLabelText(m.form.label), "nope");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByRole("alert")).toHaveTextContent(m.errors.invalid);
    at.path = "/accuracy";
    drawn.rerender(<UpdatesBand />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    sent();
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
    at.path = "/privacy";
    drawn.rerender(<UpdatesBand />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText(m.form.label)).toHaveValue("");
  });

  it("records a sign-up on the landing as coming from the landing", async () => {
    const fetchMock = sent();
    draw("/");
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "asha@example.in", list: "news", source: "landing" });
  });

  it("records a sign-up on an app page as coming from the footer, the stored value those pages always sent", async () => {
    const fetchMock = sent();
    draw("/pnr");
    await userEvent.type(screen.getByLabelText(m.form.label), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: m.form.subscribe }));
    expect(await screen.findByRole("status")).toHaveTextContent(m.sent);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: "asha@example.in", list: "news", source: "footer" });
  });
});
