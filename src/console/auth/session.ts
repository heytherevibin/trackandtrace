import { createConsoleServiceDb, type ConsoleDb } from "@/console/auth/db";
import { deriveDataKeys, keyedHash } from "@/services/data-key";
import { env } from "@/services/env";
import { addressKey } from "@/services/rate-limit";

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\bFirefox\//, "Firefox"],
  [/\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b|\biPad\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

function first(pairs: readonly (readonly [RegExp, string])[], text: string): string | null {
  for (const [pattern, name] of pairs) if (pattern.test(text)) return name;
  return null;
}

/**
 * What the audit log and My keys call this session: "Chrome on macOS". Never empty and never
 * longer than the column's 120 characters, because console.sessions checks both.
 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  // Edge and Opera both claim Chrome, and every one of them claims Safari, so order decides.
  const browser = first(BROWSERS, userAgent);
  const system = first(SYSTEMS, userAgent);
  if (!browser && !system) return "Unknown device";
  const label = browser && system ? `${browser} on ${system}` : (browser ?? system ?? "Unknown device");
  return label.slice(0, 120);
}

/**
 * The address, one-way. Keyed with DATA_KEY so a stored hash cannot be walked back through the
 * whole IPv4 space; a deployment always has DATA_KEY (the environment check requires it), and a
 * local run without one has nothing worth protecting, so it stores a constant instead.
 */
export function consoleAddressHash(ip: string): string {
  const dataKey = env().DATA_KEY;
  if (!dataKey) return "local";
  return keyedHash(deriveDataKeys(dataKey).clientId, addressKey(ip)).slice(0, 128);
}

/** Which deployment a row belongs to. Settings and the audit log are per environment (spec §F). */
export function consoleEnvironment(): string {
  return env().VERCEL_ENV ?? env().NODE_ENV;
}

/** Setup until two keys exist (spec §C step 2), the key step afterwards. */
export function nextAfterConfirm(keyCount: number): "/setup" | "/keys" {
  return keyCount < 2 ? "/setup" : "/keys";
}

export async function startConsoleSession(args: {
  readonly sessionId: string;
  readonly member: string;
  readonly userAgent: string | null;
  readonly ip: string;
  readonly db?: ConsoleDb;
}): Promise<void> {
  const db = args.db ?? createConsoleServiceDb();
  const { error } = await db.rpc("console_auth_start_session", {
    p_session_id: args.sessionId,
    p_member: args.member,
    p_device_label: deviceLabel(args.userAgent),
    p_address_hash: consoleAddressHash(args.ip),
  });
  if (error) throw new Error(`console_auth_start_session: ${error.message}`);
}

export async function endConsoleSession(sessionId: string, db?: ConsoleDb): Promise<void> {
  const client = db ?? createConsoleServiceDb();
  await client.rpc("console_auth_revoke_session", { p_session_id: sessionId });
}
