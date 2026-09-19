import type { Event } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText } from "@/services/telemetry/scrub";

const PNR = "2345678901";
const MASKED = "23••••••01";
const TOKEN = `provider_${"x9".repeat(16)}`;

describe("scrubText", () => {
  it("masks PNRs, emails, bearer tokens and token-shaped runs", () => {
    expect(scrubText(`no record for ${PNR}`)).toBe(`no record for ${MASKED}`);
    expect(scrubText("mail traveller@example.com now")).toBe("mail [email] now");
    expect(scrubText("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")).toBe("Authorization: Bearer [token]");
    expect(scrubText(`key ${TOKEN} refused`)).toBe("key [token] refused");
  });

  it("keeps ordinary words, short ids and chunk hashes", () => {
    const plain = "TypeError: cannot read x of undefined at /_next/static/chunks/0a1b2c3d4e5f6789.js";
    expect(scrubText(plain)).toBe(plain);
  });
});

describe("scrubEvent", () => {
  const event: Event = {
    event_id: "0123456789abcdef0123456789abcdef",
    message: `failed for ${PNR}`,
    transaction: "POST /api/pnr",
    exception: { values: [{ type: "Error", value: `bad ${PNR} for traveller@example.com`, stacktrace: { frames: [{ filename: "app/api/pnr/route.ts", function: "POST" }] } }] },
    breadcrumbs: [{ category: "fetch", message: `GET ${PNR}`, data: { url: `https://provider.example/api/v1/pnr/${PNR}?key=${TOKEN}`, method: "GET" } }],
    request: {
      url: `https://trakline.in/pnr?utm=1#${PNR}`,
      method: "POST",
      cookies: { "sb-access-token": "secret" },
      data: { pnr: PNR },
      query_string: "pnr=2345678901",
      headers: { Authorization: "Bearer abc", Cookie: "a=b", "x-api-key": TOKEN, "user-agent": "Mozilla/5.0" },
    },
    user: { ip_address: "203.0.113.9", email: "traveller@example.com", id: "anon" },
    extra: { nested: { deeper: [`${PNR}`, 42, true] } },
    contexts: { trace: { trace_id: "0123456789abcdef0123456789abcdef", span_id: "0123456789abcdef" }, app: { note: PNR } },
    spans: [{ span_id: "0123456789abcdef", trace_id: "0123456789abcdef0123456789abcdef", description: `GET /api/v1/pnr/${PNR}`, data: { "http.url": `https://provider.example/api/v1/pnr/${PNR}` } } as never],
  };
  const out = scrubEvent(event);
  const text = JSON.stringify(out);

  it("leaves no PNR, email, token, cookie, body or query string anywhere", () => {
    expect(text).not.toContain(PNR);
    expect(text).not.toContain("traveller@example.com");
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("sb-access-token");
    expect(text).not.toContain("utm=1");
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
  });

  it("keeps paths, and cuts the query and the fragment off URLs", () => {
    expect(out.request?.url).toBe("https://trakline.in/pnr");
    expect(out.breadcrumbs?.[0]?.data?.url).toBe(`https://provider.example/api/v1/pnr/${MASKED}`);
  });

  it("drops credentials from headers and the user's address and email", () => {
    expect(Object.keys(out.request?.headers ?? {}).map((k) => k.toLowerCase())).toEqual(["user-agent"]);
    expect(out.user).toEqual({ id: "anon" });
  });

  it("keeps the ids Sentry needs, stack frames, and non-text values", () => {
    expect(out.event_id).toBe(event.event_id);
    expect(out.contexts?.trace).toEqual(event.contexts?.trace);
    expect(out.exception?.values?.[0]?.stacktrace).toEqual(event.exception?.values?.[0]?.stacktrace);
    expect(out.extra).toEqual({ nested: { deeper: [MASKED, 42, true] } });
    expect(out.transaction).toBe("POST /api/pnr");
  });
});

describe("scrubBreadcrumb", () => {
  it("masks the message and cuts queries and fragments off navigation", () => {
    const crumb = scrubBreadcrumb({ category: "navigation", message: `to ${PNR}`, data: { from: `/pnr#${PNR}`, to: "/watchlist?x=1" } });
    expect(crumb).toEqual({ category: "navigation", message: `to ${MASKED}`, data: { from: "/pnr", to: "/watchlist" } });
  });
});
