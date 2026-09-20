import { describe, expect, it } from "vitest";
import { parseAuthMember, parseConsoleMember, parseLinkSession, ROLE_RANK, sessionIdFromClaims } from "@/console/auth/member";

const VALID = {
  user_id: "11111111-1111-1111-1111-111111111111",
  email: "asha@trakline.in",
  name: "Asha Rao",
  role: "owner",
  status: "active",
};

const VALID_AUTH = { ...VALID, key_count: 2 };

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

describe("parseAuthMember", () => {
  it("reads the shape console_auth_member_by_email returns", () => {
    expect(parseAuthMember(VALID_AUTH)).toEqual({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "asha@trakline.in",
      name: "Asha Rao",
      role: "owner",
      status: "active",
      keyCount: 2,
    });
  });

  it("is null for a missing row -- 'not a member' is an ordinary answer here, not a thrown error", () => {
    expect(parseAuthMember(null)).toBeNull();
  });

  it("is null when status is missing", () => {
    const { user_id, email, name, role, key_count } = VALID_AUTH;
    expect(parseAuthMember({ user_id, email, name, role, key_count })).toBeNull();
  });

  it("is null for a role that isn't one of the four", () => {
    expect(parseAuthMember({ ...VALID_AUTH, role: "root" })).toBeNull();
  });
});

describe("parseLinkSession", () => {
  const SESSION = {
    session_id: "22222222-2222-2222-2222-222222222222",
    member_id: "11111111-1111-1111-1111-111111111111",
    email: "asha@trakline.in",
    name: "Asha Rao",
    role: "owner",
    status: "setup",
    key_verified: false,
    key_count: 0,
  };

  it("reads the shape console_auth_session returns", () => {
    expect(parseLinkSession(SESSION)).toEqual({
      sessionId: "22222222-2222-2222-2222-222222222222",
      memberId: "11111111-1111-1111-1111-111111111111",
      email: "asha@trakline.in",
      name: "Asha Rao",
      role: "owner",
      status: "setup",
      keyVerified: false,
      keyCount: 0,
    });
  });

  it("is null for a missing row -- requireLinkSession is the one that decides that means 'session ended'", () => {
    expect(parseLinkSession(null)).toBeNull();
  });

  it("is null for a role that isn't one of the four, rather than trusting it", () => {
    expect(parseLinkSession({ ...SESSION, role: "root" })).toBeNull();
  });

  it("is null when key_verified is missing", () => {
    const { session_id, member_id, email, name, role, status, key_count } = SESSION;
    expect(parseLinkSession({ session_id, member_id, email, name, role, status, key_count })).toBeNull();
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
