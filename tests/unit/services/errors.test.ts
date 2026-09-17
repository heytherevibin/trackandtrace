import { describe, it, expect } from "vitest";
import { AppError, toApiError } from "@/services/errors";

describe("AppError", () => {
  it("maps UNAUTHENTICATED to 401", () => {
    const err = new AppError("UNAUTHENTICATED", "Sign in required.");
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("maps RATE_LIMITED to 429", () => {
    const err = new AppError("RATE_LIMITED", "Slow down.", { retryAfter: 30 });
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);
  });

  it("maps SOURCE_UNAVAILABLE to 503", () => {
    const err = new AppError("SOURCE_UNAVAILABLE", "Down.");
    expect(err.status).toBe(503);
  });
});

describe("toApiError", () => {
  it("converts AppError to API body", () => {
    const err = new AppError("NOT_FOUND", "No such thing.");
    const body = toApiError(err);
    expect(body).toEqual({ ok: false, code: "NOT_FOUND", message: "No such thing.", retryAfter: undefined });
  });

  it("converts unknown error to INTERNAL", () => {
    const body = toApiError(new Error("oops"));
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INTERNAL");
    expect(body.message).toBe("oops");
  });

  it("converts non-Error to INTERNAL", () => {
    const body = toApiError("string error");
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INTERNAL");
  });
});
