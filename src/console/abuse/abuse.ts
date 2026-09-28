/** "a3f9…c2c1": the sheet's way of drawing a hash — enough to tell two apart, not a string to copy. */
export function shortHash(hash: string): string {
  return hash.length <= 9 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

/** A stored member ("4.<hash>") as the sheet draws it: its hash, shortened. The kind is drawn as a tag, not as text. */
export function shortMember(member: string): string {
  return shortHash(member.slice(member.indexOf(".") + 1));
}

const KIND = { ipv4: "4", ipv6: "6", unknown: "?" } as const;

/** The stored member for a hash and its kind — how a Most limited row is blocked as it stands. */
export function memberOf(hash: string, network: keyof typeof KIND): string {
  return `${KIND[network]}.${hash}`;
}

// The literals console_block_address and console_unblock_address pass to console.use_tap
// (supabase/migrations/20260928090000_console_blocks.sql). Digest fields, never rendered.
export const BLOCK_ACTION = "Blocked an address";
export const UNBLOCK_ACTION = "Unblocked an address";

/**
 * The value a block's tap is minted over and spent against: one canonical string, the environment
 * first. The dialog mints with it and the route spends with it; built in one place so the two can
 * never digest different strings.
 */
export function blockTapValue(environment: string, duration: string, note: string): string {
  return JSON.stringify({ environment, duration, note });
}

export function unblockTapValue(environment: string): string {
  return JSON.stringify({ environment });
}
