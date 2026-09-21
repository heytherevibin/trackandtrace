import { describe, expect, it } from "vitest";
import { nameFromAddress, setupTokenHash } from "@/console/setup/redeem";

describe("setupTokenHash", () => {
  it("hashes the token the way create_first_owner_link stored it", () => {
    // console.create_first_owner_link stores digest(token, 'sha256'); PostgREST takes bytea as \x hex.
    expect(setupTokenHash("abc")).toBe("\\xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("is stable and case-sensitive, because the token is hex from the database", () => {
    expect(setupTokenHash("ABC")).not.toBe(setupTokenHash("abc"));
  });
});

describe("nameFromAddress", () => {
  it("makes a readable name out of the local part", () => {
    expect(nameFromAddress("asha.rao@trakline.in")).toBe("Asha Rao");
    expect(nameFromAddress("kiran_das@trakline.in")).toBe("Kiran Das");
    expect(nameFromAddress("rohan-iyer@trakline.in")).toBe("Rohan Iyer");
    expect(nameFromAddress("console@trakline.in")).toBe("Console");
  });

  it("always answers something the column will take", () => {
    expect(nameFromAddress("@trakline.in")).toBe("Owner");
    expect(nameFromAddress("x".repeat(200) + "@trakline.in").length).toBeLessThanOrEqual(120);
  });
});
