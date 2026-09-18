import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

// Result links carry the PNR after "#". The pre-hydration form posts it, and old /pnr/<pnr> links
// redirect once to the hash form.

describe("/check", () => {
  function form(pnr: string) {
    const body = new URLSearchParams({ pnr });
    return new NextRequest("http://localhost/check", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  }

  it("redirects a posted PNR to its result, keeping it after #", async () => {
    const { POST } = await import("@/app/check/route");
    const res = await POST(form("234 567 8901"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/pnr#2345678901");
  });

  it("sends anything else home", async () => {
    const { POST } = await import("@/app/check/route");
    const res = await POST(form("12345"));
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("still honours an old GET form submission, redirecting to the hash form", async () => {
    const { GET } = await import("@/app/check/route");
    const res = GET(new NextRequest("http://localhost/check?pnr=2345678901"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/pnr#2345678901");
  });
});

describe("legacy /pnr/[pnr]", () => {
  it("redirects permanently to /pnr#<pnr>", async () => {
    const { GET } = await import("@/app/pnr/[pnr]/route");
    const res = await GET(new NextRequest("http://localhost/pnr/2345678901"), { params: Promise.resolve({ pnr: "2345678901" }) });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost/pnr#2345678901");
  });

  it("sends an invalid one to the empty result page", async () => {
    const { GET } = await import("@/app/pnr/[pnr]/route");
    const res = await GET(new NextRequest("http://localhost/pnr/abc"), { params: Promise.resolve({ pnr: "abc" }) });
    expect(res.headers.get("location")).toBe("http://localhost/pnr");
  });
});
