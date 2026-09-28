import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { siteNotice, cookieValue, connection } = vi.hoisted(() => ({
  siteNotice: vi.fn<() => Promise<{ readonly text: string; readonly version: number } | null>>(),
  cookieValue: { current: undefined as string | undefined },
  connection: vi.fn(async () => undefined),
}));
vi.mock("@/services/runtime-settings", () => ({ siteNotice }));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookieValue.current === undefined ? undefined : { value: cookieValue.current }) }) }));

import { SiteNoticeStrip } from "@/components/shell/site-notice";
import { NOTICE_COOKIE } from "@/components/shell/site-notice-cookie";
import { SiteNoticeSlot } from "@/components/shell/site-notice-slot";
import { messages } from "@/messages";

// ---------------------------------------------------------------------------
// The site notice strip (Notices.dc.html, SITE NOTICE STRIP): under the masthead on
// every page, a lamp, the text and a 44px close button. "Once closed, it stays
// closed for that notice on this device" — so closing remembers the notice's
// VERSION, and a new notice (a new version) shows again.
//
// The closed version is a cookie, read on the server, so a notice this device
// closed is never drawn and then snatched away on hydration.
// ---------------------------------------------------------------------------

const m = messages.shell.siteNotice;
const TEXT = "Planned maintenance on 21 Sep, 02:00–03:00 IST. Checks may be slow.";

afterEach(() => {
  cookieValue.current = undefined;
  siteNotice.mockReset();
  connection.mockReset();
  connection.mockImplementation(async () => undefined);
  document.cookie = `${NOTICE_COOKIE}=; max-age=0; path=/`;
});

describe("SiteNoticeStrip", () => {
  it("draws the notice as a labelled region, with a close button", () => {
    render(<SiteNoticeStrip text={TEXT} version={3} />);
    expect(screen.getByRole("region", { name: m.label })).toHaveTextContent(TEXT);
    expect(screen.getByRole("button", { name: m.close })).toBeInTheDocument();
  });

  it("goes away when closed, and remembers which notice was closed", async () => {
    render(<SiteNoticeStrip text={TEXT} version={3} />);
    await userEvent.click(screen.getByRole("button", { name: m.close }));
    expect(screen.queryByRole("region", { name: m.label })).not.toBeInTheDocument();
    expect(document.cookie).toContain(`${NOTICE_COOKIE}=3`);
  });
});

async function slot() {
  const element = await SiteNoticeSlot();
  return render(<>{element}</>);
}

describe("SiteNoticeSlot", () => {
  it("draws the notice when it is on and this device has not closed it", async () => {
    siteNotice.mockResolvedValue({ text: TEXT, version: 3 });
    await slot();
    expect(screen.getByRole("region", { name: m.label })).toHaveTextContent(TEXT);
  });

  it("draws nothing for a notice this device closed", async () => {
    siteNotice.mockResolvedValue({ text: TEXT, version: 3 });
    cookieValue.current = "3";
    await slot();
    expect(screen.queryByRole("region", { name: m.label })).not.toBeInTheDocument();
  });

  it("draws a NEW notice even on a device that closed the last one", async () => {
    siteNotice.mockResolvedValue({ text: "Checks are back.", version: 4 });
    cookieValue.current = "3";
    await slot();
    expect(screen.getByRole("region", { name: m.label })).toHaveTextContent("Checks are back.");
  });

  /**
   * Found 2026-09-28: when the build read the notice as off, the slot returned before touching the
   * cookie, so nothing marked the page as per-request — /privacy, /tos, /pnr and the rest were
   * prerendered with no notice, and would never have shown one. Next's connection() is the signal:
   * during a prerender it does not return (it marks the page per-request), so the slot must reach it before reading anything.
   */
  it("waits for a real request before reading the notice, so no page is built with one baked in", async () => {
    connection.mockImplementation(() => new Promise<undefined>(() => {}));
    siteNotice.mockResolvedValue({ text: TEXT, version: 3 });
    void SiteNoticeSlot();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connection).toHaveBeenCalled();
    expect(siteNotice).not.toHaveBeenCalled();
  });

  it("draws nothing when the notice is off", async () => {
    siteNotice.mockResolvedValue(null);
    await slot();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
