/** "a3f9…c2c1": the sheet's way of drawing a hash — enough to tell two apart, not a string to copy. */
export function shortHash(hash: string): string {
  return hash.length <= 9 ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}
