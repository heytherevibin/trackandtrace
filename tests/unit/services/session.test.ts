import { describe, expect, it } from "vitest";
import { currentUserFrom, userFromClaims } from "@/services/session";
import { FakeSupabase } from "../../helpers/fake-supabase";

describe("userFromClaims", () => {
  it("maps sub, email, and metadata to the DTO without any", () => {
    const user = userFromClaims({ sub: "u1", email: "a@b.c", user_metadata: { full_name: "Asha", avatar_url: "https://img/a.png" } });
    expect(user).toEqual({ id: "u1", email: "a@b.c", name: "Asha", avatarUrl: "https://img/a.png" });
  });
  it("prefers full_name, then name, and picture as an avatar fallback", () => {
    expect(userFromClaims({ sub: "u1", user_metadata: { name: "N", picture: "p" } })).toMatchObject({ name: "N", avatarUrl: "p" });
    expect(userFromClaims({ sub: "u1", user_metadata: { full_name: "F", name: "N" } })).toMatchObject({ name: "F" });
  });
  it("returns null without a subject or for non-objects", () => {
    expect(userFromClaims({ email: "x" })).toBeNull();
    expect(userFromClaims("nope")).toBeNull();
    expect(userFromClaims(null)).toBeNull();
  });
});

describe("currentUserFrom", () => {
  it("returns null when claims are missing or errored", async () => {
    const fake = new FakeSupabase();
    expect(await currentUserFrom(fake.asDb())).toBeNull();
    fake.auth.getClaims.mockResolvedValueOnce({ data: null, error: { message: "expired" } });
    expect(await currentUserFrom(fake.asDb())).toBeNull();
  });
  it("returns the DTO from verified claims", async () => {
    const fake = new FakeSupabase();
    fake.auth.getClaims.mockResolvedValueOnce({ data: { claims: { sub: "u9", email: "e@x.y" } }, error: null });
    expect(await currentUserFrom(fake.asDb())).toEqual({ id: "u9", email: "e@x.y", name: null, avatarUrl: null });
  });
});
