import { describe, expect, it } from "vitest";
import { parseConsoleMember, ROLE_RANK, sessionIdFromClaims } from "@/console/auth/member";

const VALID = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

describe("parseConsoleMember", () => {
  it("reads the shape console_me returns", () => {
    expect(parseConsoleMember(VALID)).toEqual({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "asha@trakline.in",
      name: "Asha Rao",
      role: "owner",
      status: "active",
    });
  });

  it("refuses an unknown role rather than ranking it as nothing", () => {
    expect(() => parseConsoleMember({ ...VALID, role: "root" })).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });

  it("refuses null, which is what a missing row looks like over PostgREST", () => {
    expect(() => parseConsoleMember(null)).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });
});

describe("ROLE_RANK", () => {
  it("ranks the four roles as console.role_rank does", () => {
    expect(ROLE_RANK).toEqual({ owner: 4, admin: 3, support: 2, viewer: 1 });
  });
});

describe("sessionIdFromClaims", () => {
  it("reads the session_id claim Supabase puts in the access token", () => {
    expect(sessionIdFromClaims({ sub: "u", session_id: "22222222-2222-2222-2222-222222222222" })).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("is null when the claim is missing, empty or not a string", () => {
    expect(sessionIdFromClaims({ sub: "u" })).toBeNull();
    expect(sessionIdFromClaims({ session_id: "" })).toBeNull();
    expect(sessionIdFromClaims({ session_id: 7 })).toBeNull();
    expect(sessionIdFromClaims(null)).toBeNull();
  });
});
