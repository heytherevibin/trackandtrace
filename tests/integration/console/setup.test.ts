import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getClaims = vi.fn();
const signOut = vi.fn();
const signInWithOtp = vi.fn();
const createUser = vi.fn();
const generateLink = vi.fn();
const inviteUserByEmail = vi.fn();
const serviceRpc = vi.fn();

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve({ auth: { verifyOtp, getClaims, signOut, signInWithOtp } }),
  createConsoleServiceDb: () => ({ rpc: serviceRpc, auth: { admin: { createUser, generateLink, inviteUserByEmail }, signInWithOtp } }),
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

// An accepted invite's letter is sendSignInLink, not a second copy of the mint-and-mail logic --
// mocked at the module boundary so the accept path can be asserted without also re-testing that
// function's own contract (tests/unit/console/auth/sign-in-link.test.ts already does).
const { sendSignInLink } = vi.hoisted(() => ({ sendSignInLink: vi.fn(() => Promise.resolve()) }));
vi.mock("@/console/auth/sign-in-link", () => ({ sendSignInLink }));

import { POST } from "@/app/console/api/setup/route";

const OWNER = "11111111-1111-1111-1111-111111111111";
// console.create_first_owner_link mints encode(gen_random_bytes(32), 'hex') -- exactly 64 lowercase
// hex characters.
const TOKEN = "deadbeef".repeat(8);

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
  signOut.mockResolvedValue({ error: null });
});

describe("POST /api/setup", () => {
  it("signs the first Owner in and redeems the link in one go", async () => {
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "magiclink", email: "asha.rao@trakline.in" }));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hashed" });
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_redeem_setup_link", expect.objectContaining({ p_user: OWNER, p_name: "Asha Rao" }));
    expect(startConsoleSession).toHaveBeenCalledOnce();
    // The cookie verifyOtp wrote is the whole point of the new session; a completed redemption
    // must never sign it back out.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sends no email at all — the link out of the SQL editor is the whole credential", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await POST(post({ token: TOKEN }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
    // email_confirm is what stops Supabase mailing a confirmation of its own when the account is
    // freshly created.
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }));
    vi.unstubAllGlobals();
  });

  it("refuses a token with no live link, without signing anyone in", async () => {
    serviceRpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "This invite has expired. Ask an Owner to send a new one." });
    expect(generateLink).not.toHaveBeenCalled();
    // Refused before verifyOtp ever ran, so there is no cookie to sign back out.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses when redemption returns nothing, because an Owner already exists, and signs the fresh cookie back out", async () => {
    serviceRpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "console_auth_setup_link" ? { email: "asha.rao@trakline.in" } : null, error: null }),
    );
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(400);
    expect(startConsoleSession).not.toHaveBeenCalled();
    // verifyOtp already succeeded by this point (decision #2): every exit from here on must sign
    // that cookie back out. Deleting the redeem.ts try/finally would leave this assertion the only
    // thing catching it.
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("signs the fresh cookie back out when a verified session carries no session_id or sub", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: OWNER } }, error: null });
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(400);
    expect(startConsoleSession).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("refuses a token that is not hex, before touching the database", async () => {
    const response = await POST(post({ token: "not a token" }));
    expect(response.status).toBe(400);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it("refuses a token that is hex but the wrong length, before touching the database", async () => {
    const response = await POST(post({ token: "deadbeef" }));
    expect(response.status).toBe(400);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/setup — accepting an invite", () => {
  const MEMBER = "33333333-3333-3333-3333-333333333333";

  function mockInvite(overrides: Partial<{ readonly expired: boolean; readonly withdrawn: boolean }> = {}) {
    serviceRpc.mockImplementation((name: string) => {
      if (name === "console_auth_invite") {
        return Promise.resolve({
          data: { email: "kiran.das@trakline.in", role: "support", expired: false, withdrawn: false, ...overrides },
          error: null,
        });
      }
      if (name === "console_auth_accept_invite") {
        return Promise.resolve({ data: { user_id: MEMBER, role: "support", status: "setup" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    createUser.mockResolvedValue({ data: { user: { id: MEMBER } }, error: null });
    generateLink.mockResolvedValue({ data: { user: { id: MEMBER }, properties: { hashed_token: "hashed" } }, error: null });
  }

  it("is told apart from a first-Owner link: it creates the address's account, accepts, and only then sends a sign-in link", async () => {
    mockInvite();
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, kind: "invite" });

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "kiran.das@trakline.in", email_confirm: true }));
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_accept_invite", expect.objectContaining({ p_user: MEMBER, p_name: "Kiran Das" }));
    expect(sendSignInLink).toHaveBeenCalledWith("kiran.das@trakline.in", expect.any(String), expect.anything());

    // Order matters (the brief's own words: "accepting calls console_auth_accept_invite and then
    // sends a sign-in link") -- the letter is a consequence of acceptance, not a parallel step.
    const acceptCallIndex = serviceRpc.mock.calls.findIndex(([name]) => name === "console_auth_accept_invite");
    const acceptOrder = serviceRpc.mock.invocationCallOrder[acceptCallIndex];
    const sendOrder = sendSignInLink.mock.invocationCallOrder[0];
    expect(sendOrder).toBeGreaterThan(acceptOrder);

    // Not the first-Owner shape: no cookie-writing session is started on this browser. The member
    // signs in later, on whatever device opens the mailed link.
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(startConsoleSession).not.toHaveBeenCalled();
  });

  it("refuses an expired invite with the sheet's own line, never touching auth or sending anything", async () => {
    mockInvite({ expired: true });
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "This invite has expired. Ask an Owner to send a new one." });
    expect(createUser).not.toHaveBeenCalled();
    expect(sendSignInLink).not.toHaveBeenCalled();
  });

  it("refuses a withdrawn invite with its own line, distinct from expired", async () => {
    mockInvite({ withdrawn: true });
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "This invite was withdrawn." });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("prefers withdrawn over expired when an invite is somehow both", async () => {
    mockInvite({ expired: true, withdrawn: true });
    const response = await POST(post({ token: TOKEN }));
    expect(await response.json()).toMatchObject({ message: "This invite was withdrawn." });
  });

  it("answers the very same refusal for a token nobody issued as for a dead invite -- never hinting one exists", async () => {
    serviceRpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    const response = await POST(post({ token: TOKEN }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "This invite has expired. Ask an Owner to send a new one." });
    expect(createUser).not.toHaveBeenCalled();
  });
});
