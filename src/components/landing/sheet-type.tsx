// Type roles of the landing sheet, transcribed from Landing Redesign B. Where the
// drawing sets no line height, the page's 1.5 applies, so these say so explicitly.
// Plain strings: these are composed with template literals, never merged.

/** "02 · How it works": 13px condensed capitals in readable steel. */
export const KICKER = "block font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text";
/** Section heading: 32/36 condensed capitals, hung optically. */
export const H2 = "optical-hang text-5xl tracking-head";
/** Card and step heading: 22/24 condensed capitals. */
export const H3 = "text-2xl leading-6 tracking-head";
/** Body copy: 15/24 at 78%. */
export const BODY = "text-body leading-6 text-ink-1/78";
/** Condensed 13px capitals, as the feature links draw them. */
export const SHEET_LINK = "font-display text-label font-semibold uppercase leading-normal tracking-caps no-underline";
/** 13px condensed figures in steel: row numbers. */
export const ROW_NUM = "font-display text-label font-semibold leading-normal tracking-caps text-accent-text tnum";
/** 11px table heads. */
export const TABLE_HEAD = "font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";

/** The kicker and its hairline rule; the rule's bottom margin varies by section as drawn. */
export function SectionKicker({ children, rule }: { readonly children: string; readonly rule: "mb-3" | "mb-6" | "mb-8" }) {
  return (
    <>
      <span className={`mb-3 ${KICKER}`}>{children}</span>
      <hr className={`h-px border-0 bg-line ${rule}`} />
    </>
  );
}
