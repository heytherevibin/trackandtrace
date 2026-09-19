// The one colour-contrast exemption in the e2e axe scans, kept free of Playwright so a unit test can load it.

/**
 * The locked steel fill and its drawn hover step. The primary button's pale words sit on it at the
 * design's 3:1, kept as drawn; the skip link and the toast's action button share the pairing.
 */
export const DESIGN_LOCKED_ACCENT: ReadonlySet<string> = new Set(["#5980a6", "#597ea3"]);

/** The part of an axe result node this reads: each check's data (colour-contrast puts fgColor and bgColor there). */
export interface ContrastNode {
  readonly any: readonly { readonly data?: unknown }[];
}

/**
 * Exempt only when the node's background is the locked steel fill. Steel text on a ground is never
 * exempt: it uses the readable steel, so a steel foreground below AA fails the scan.
 */
export function isDesignLockedAccent(node: ContrastNode): boolean {
  return node.any.some((check) => {
    const data: unknown = check.data;
    if (typeof data !== "object" || data === null) return false;
    const { bgColor } = data as { readonly bgColor?: unknown };
    return typeof bgColor === "string" && DESIGN_LOCKED_ACCENT.has(bgColor);
  });
}
