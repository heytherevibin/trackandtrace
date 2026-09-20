// Which host a request is for. The console answers only on its own host, and the traveller site on every
// other. Hosts are constants per environment, so a preview never serves the console.

export const CONSOLE_HOST_PRODUCTION = "admin.trakline.in";
export const CONSOLE_HOST_LOCAL = "admin.localhost";

/** The request's host, lower-cased and without its port. Null when the header is missing or unreadable. */
export function requestHost(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim().toLowerCase();
  // Next takes everything before the first colon, same as here: a colon with nothing after it
  // (an empty port) still reads as the bare host, rather than falling through the digit-only check.
  const colonIndex = trimmed.indexOf(":");
  const host = colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex);
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/** Production answers only on admin.trakline.in; every other environment only on admin.localhost. */
export function consoleHostFor(vercelEnv: string | undefined): typeof CONSOLE_HOST_PRODUCTION | typeof CONSOLE_HOST_LOCAL {
  return vercelEnv === "production" ? CONSOLE_HOST_PRODUCTION : CONSOLE_HOST_LOCAL;
}

export function isConsoleHost(header: string | null, vercelEnv: string | undefined): boolean {
  return requestHost(header) === consoleHostFor(vercelEnv);
}
