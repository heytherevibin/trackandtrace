import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getClaims = vi.fn();
const createUser = vi.fn();
const generateLink = vi.fn();
const serviceRpc = vi.fn();

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve({ auth: { verifyOtp, getClaims } }),
  createConsoleServiceDb: () => ({ rpc: serviceRpc, auth: { admin: { createUser, generateLink } } }),
  CONSOLE_COOKIE_NAME: "sb-console-auth-token",
}));

// vi.mock's factory is hoisted above a plain top-level const, and this one -- unlike the @/console/auth/db
// factory above -- reads startConsoleSession directly in the object it returns rather than inside a
// nested closure, so it needs the value hoisted alongside it (same trap as webauthn.test.ts).
const { startConsoleSession } = vi.hoisted(() => ({ startConsoleSession: vi.fn(() => Promise.resolve()) }));
vi.mock("@/console/auth/session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startConsoleSession,
}));

import { POST } from "@/app/console/api/setup/route";

const OWNER = "11111111-1111-1111-1111-111111111111";

function post(body: unknown): Request {
  return new Request("http://admin.localhost:4210/console/api/setup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceRpc.mockImplementation((name: string) =>
    Promise.resolve({
      data:
        name === "console_auth_setup_link"
          ? { email: "asha.rao@trakline.in" }
          : name === "console_auth_redeem_setup_link"
            ? { user_id: OWNER, role: "owner", status: "setup" }
            : null,
      error: null,
    }),
  );
  createUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hashed" } }, error: null });
  verifyOtp.mockResolvedValue({ data: { user: { id: OWNER, email: "asha.rao@trakline.in" } }, error: null });
  getClaims.mockResolvedValue({ data: { claims: { sub: OWNER, session_id: "22222222-2222-2222-2222-222222222222" } }, error: null });
});

describe("POST /api/setup", () => {
  it("signs the first Owner in and redeems the link in one go", async () => {
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "magiclink", email: "asha.rao@trakline.in" }));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hashed" });
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_redeem_setup_link", expect.objectContaining({ p_user: OWNER, p_name: "Asha Rao" }));
    expect(startConsoleSession).toHaveBeenCalledOnce();
  });

  it("sends no email at all — the link out of the SQL editor is the whole credential", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await POST(post({ token: "deadbeef" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses a token with no live link, without signing anyone in", async () => {
    serviceRpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "This invite has expired. Ask an Owner to send a new one." });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("refuses when redemption returns nothing, because an Owner already exists", async () => {
    serviceRpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "console_auth_setup_link" ? { email: "asha.rao@trakline.in" } : null, error: null }),
    );
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(400);
    expect(startConsoleSession).not.toHaveBeenCalled();
  });

  it("refuses a token that is not hex, before touching the database", async () => {
    const response = await POST(post({ token: "not a token" }));
    expect(response.status).toBe(400);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});
